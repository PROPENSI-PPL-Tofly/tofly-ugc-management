import { afterEach, describe, expect, it, vi } from "vitest";
import { submitVideo } from "./video-submission";

afterEach(() => {
  vi.restoreAllMocks();
});

const CONTENT_ID = "11111111-1111-4111-8111-111111111111";

const submittedVideo = {
  contentId: CONTENT_ID,
  status: "link_submitted",
  link: "https://www.tiktok.com/@tofly/video/7400000000000000000",
  submittedAt: "2026-09-26T10:00:00.000Z",
};

describe("submitVideo", () => {
  it("posts the video link to the correct content endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(submittedVideo), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await submitVideo(CONTENT_ID, {
      link: "https://www.tiktok.com/@tofly/video/7400000000000000000",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/contents/${CONTENT_ID}/video`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          link: "https://www.tiktok.com/@tofly/video/7400000000000000000",
        }),
      },
    );
  });

  it("returns the submitted video after a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(submittedVideo), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await submitVideo(CONTENT_ID, {
      link: submittedVideo.link,
    });

    expect(result).toEqual({ ok: true, submission: submittedVideo });
  });

  it("surfaces the backend conflict message and code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "VIDEO_NOT_ELIGIBLE",
            message: "Konten ini sedang tidak menerima link video",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: submittedVideo.link });

    expect(result).toEqual({
      ok: false,
      message: "Konten ini sedang tidak menerima link video",
      code: "VIDEO_NOT_ELIGIBLE",
    });
  });

  it("keeps the field-specific error for the link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Validation failed",
            errors: { link: "link must be a valid URL" },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: "nope" });

    expect(result).toEqual({
      ok: false,
      message: "Validation failed",
      errors: { link: "link must be a valid URL" },
    });
  });

  it("falls back to a generic message when the body says nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 500 }),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: submittedVideo.link });

    expect(result).toEqual({
      ok: false,
      message: "Video gagal dikirim. Coba lagi.",
    });
  });

  it("falls back when the parsed body carries no usable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: {} }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: submittedVideo.link });

    expect(result).toEqual({
      ok: false,
      message: "Video gagal dikirim. Coba lagi.",
      errors: {},
    });
  });

  it("ignores malformed field errors instead of leaking them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Validation failed",
            errors: { link: 42 },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: "nope" });

    expect(result).toEqual({
      ok: false,
      message: "Validation failed",
      errors: {},
    });
  });
});
