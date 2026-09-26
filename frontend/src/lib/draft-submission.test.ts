import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
          contentId:
            "11111111-1111-4111-8111-111111111111",
          submissionId: "submission-1",
          status: "draft_review",
          link:
            "https://drive.google.com/file/d/example",
          notes: "Please check the intro",
          submittedAt:
            "2026-09-26T10:00:00.000Z",
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

    await submitDraft(
      "11111111-1111-4111-8111-111111111111",
      {
        link:
          "https://drive.google.com/file/d/example",
        notes: "Please check the intro",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contents/11111111-1111-4111-8111-111111111111/draft",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          link:
            "https://drive.google.com/file/d/example",
          notes: "Please check the intro",
        }),
      },
    );
  });
});