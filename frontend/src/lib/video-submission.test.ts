import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupportedVideoLink, submitVideo } from "./video-submission";

afterEach(() => {
  vi.restoreAllMocks();
});

const CONTENT_ID = "11111111-1111-4111-8111-111111111111";

const submittedVideo = {
  contentId: CONTENT_ID,
  status: "link_submitted",
  videoLink: "https://www.tiktok.com/@tofly/video/7400000000000000000",
  platform: "tiktok",
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
      link: submittedVideo.videoLink,
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

    const result = await submitVideo(CONTENT_ID, { link: submittedVideo.videoLink });

    expect(result).toEqual({
      ok: false,
      message: "Konten ini sedang tidak menerima link video",
      code: "VIDEO_NOT_ELIGIBLE",
    });
  });

  it("keeps the backend's videoLink field error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Data link video tidak valid",
            errors: {
              videoLink: "Link video harus berupa URL http atau https",
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: "nope" });

    expect(result).toEqual({
      ok: false,
      message: "Data link video tidak valid",
      errors: {
        videoLink: "Link video harus berupa URL http atau https",
      },
    });
  });

  it("falls back to a generic message when the body says nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 500 }),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: submittedVideo.videoLink });

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

    const result = await submitVideo(CONTENT_ID, { link: submittedVideo.videoLink });

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
            message: "Data link video tidak valid",
            errors: { videoLink: 42 },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await submitVideo(CONTENT_ID, { link: "nope" });

    expect(result).toEqual({
      ok: false,
      message: "Data link video tidak valid",
      errors: {},
    });
  });
});

describe("isSupportedVideoLink", () => {
  it.each([
    ["instagram root", "https://www.instagram.com/reel/C8abc/"],
    ["instagram without www", "https://instagram.com/tofly"],
    ["instagram subdomain", "https://m.instagram.com/reel/C8abc/"],
    ["tiktok root", "https://www.tiktok.com/@tofly/video/7400000000000000000"],
    ["tiktok without www", "https://tiktok.com/@tofly/video/1"],
    ["http is allowed", "http://tiktok.com/@tofly/video/1"],
  ])("accepts %s", (_case, link) => {
    expect(isSupportedVideoLink(link)).toBe(true);
  });

  it.each([
    ["another platform", "https://youtube.com/watch?v=1"],
    ["lookalike domain", "https://notinstagram.com/reel/C8abc/"],
    ["suffixed lookalike", "https://instagram.com.evil.example/x"],
    ["a non-web scheme", "javascript:alert(1)"],
    ["a relative path", "/reel/C8abc"],
    ["an empty string", ""],
    ["unparseable garbage", "not a link"],
  ])("rejects %s", (_case, link) => {
    expect(isSupportedVideoLink(link)).toBe(false);
  });
});

