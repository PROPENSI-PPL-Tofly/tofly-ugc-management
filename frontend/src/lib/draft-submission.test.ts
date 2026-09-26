import { afterEach, describe, expect, it, vi } from "vitest";
import { submitDraft } from "./draft-submission";

afterEach(() => {
  // Restore mocked globals so one test cannot affect another test.
  vi.restoreAllMocks();
});

describe("submitDraft", () => {
  it("posts the draft to the correct content endpoint", async () => {
    // Stub fetch so this unit test never makes a real network request.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          contentId: "11111111-1111-4111-8111-111111111111",
          submissionId: "submission-1",
          status: "draft_review",
          link: "https://drive.google.com/file/d/example",
          notes: "Please check the intro",
          submittedAt: "2026-09-26T10:00:00.000Z",
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await submitDraft("11111111-1111-4111-8111-111111111111", {
      link: "https://drive.google.com/file/d/example",
      notes: "Please check the intro",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contents/11111111-1111-4111-8111-111111111111/draft",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          link: "https://drive.google.com/file/d/example",
          notes: "Please check the intro",
        }),
      },
    );
  });
  it("returns the submitted draft after a successful response", async () => {
    const submittedDraft = {
      contentId: "11111111-1111-4111-8111-111111111111",
      submissionId: "submission-1",
      status: "draft_review",
      link: "https://drive.google.com/file/d/example",
      notes: "Please check the intro",
      submittedAt: "2026-09-26T10:00:00.000Z",
    };

    // Stub the backend response so this test stays isolated from the real API.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(submittedDraft), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );

    const result = await submitDraft("11111111-1111-4111-8111-111111111111", {
      link: "https://drive.google.com/file/d/example",
      notes: "Please check the intro",
    });

    expect(result).toEqual({
      ok: true,
      submission: submittedDraft,
    });
  });
  it.each([
    {
      name: "validation error",
      status: 422,
      body: {
        message: "Data draft tidak valid",
        errors: {
          link: "Link draft harus berupa URL http atau https",
        },
      },
      expected: {
        ok: false,
        message: "Data draft tidak valid",
        errors: {
          link: "Link draft harus berupa URL http atau https",
        },
      },
    },
    {
      name: "ineligible content",
      status: 409,
      body: {
        code: "DRAFT_NOT_ELIGIBLE",
        message: "Konten ini sedang tidak menerima draft",
      },
      expected: {
        ok: false,
        message: "Konten ini sedang tidak menerima draft",
        code: "DRAFT_NOT_ELIGIBLE",
      },
    },
  ])("preserves the $name response", async ({ status, body, expected }) => {
    // Replace the real API call with a controlled error response.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );

    const result = await submitDraft("11111111-1111-4111-8111-111111111111", {
      link: "https://drive.google.com/file/d/example",
      notes: null,
    });

    expect(result).toEqual(expected);
  });
  it("preserves a notes validation error", async () => {
    // Simulate a field-specific validation failure for the optional notes field.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Data draft tidak valid",
            errors: {
              notes: "Catatan maksimal 1000 karakter",
            },
          }),
          {
            status: 422,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );

    const result = await submitDraft("11111111-1111-4111-8111-111111111111", {
      link: "https://drive.google.com/file/d/example",
      notes: "A note",
    });

    expect(result).toEqual({
      ok: false,
      message: "Data draft tidak valid",
      errors: {
        notes: "Catatan maksimal 1000 karakter",
      },
    });
  });
  it("uses a safe fallback for an unexpected API error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            unexpected: true,
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );

    const result = await submitDraft("11111111-1111-4111-8111-111111111111", {
      link: "https://drive.google.com/file/d/example",
      notes: null,
    });

    expect(result).toEqual({
      ok: false,
      message: "Draft gagal dikirim. Coba lagi.",
    });
  });
  it("returns a safe fallback when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(
      submitDraft("11111111-1111-4111-8111-111111111111", {
        link: "https://drive.google.com/file/d/test",
        notes: null,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Draft gagal dikirim. Coba lagi.",
    });
  });
  it("uses the safe fallback for a server error instead of exposing its message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Database connection failed",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      submitDraft("11111111-1111-4111-8111-111111111111", {
        link: "https://drive.google.com/file/d/test",
        notes: null,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Draft gagal dikirim. Coba lagi.",
    });
  });
});
