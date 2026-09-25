import { parseSubmissionPage, fetchSubmissionQueue, type SubmissionQueueItem, type SubmissionQueueResponse } from "./submissions";

describe("parseSubmissionPage", () => {
  it("defaults to the first page when nothing is given", () => {
    expect(parseSubmissionPage({})).toEqual({ page: 1, invalid: null });
  });

  it("reads a positive integer", () => {
    expect(parseSubmissionPage({ page: "3" })).toEqual({ page: 3, invalid: null });
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(parseSubmissionPage({ page: ["2", "9"] })).toEqual({ page: 2, invalid: null });
  });

  it.each(["abc", "0", "-1", "1.5", "2e1"])(
    "falls back to the first page and reports %s as invalid",
    (raw) => {
      expect(parseSubmissionPage({ page: raw })).toEqual({ page: 1, invalid: raw });
    },
  );

  it("treats an empty value as absent rather than invalid", () => {
    expect(parseSubmissionPage({ page: "" })).toEqual({ page: 1, invalid: null });
    expect(parseSubmissionPage({ page: [] })).toEqual({ page: 1, invalid: null });
  });
});

describe("fetchSubmissionQueue", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the submissions API with status=review and the requested page", async () => {
    (fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 2, pageSize: 10, total: 0, totalPages: 1 })),
    );

    await fetchSubmissionQueue(2);

    expect(fetch).toHaveBeenCalledWith(
      "/api/submissions?status=review&page=2",
      { cache: "no-store" },
    );
  });

  it("throws when the API responds with an error status", async () => {
    (fetch as any).mockResolvedValue(new Response("", { status: 500 }));

    await expect(fetchSubmissionQueue(1)).rejects.toThrow("HTTP 500");
  });

  it("returns the parsed queue response on success", async () => {
    const expected: SubmissionQueueResponse = {
      items: [
        {
          submissionId: "111",
          creatorName: "Salsa Wijaya",
          contentName: "Evg_1_Salsa_15Sep2026",
          type: "Evergreen",
          deadline: "2026-09-15",
          status: "draft_review",
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    };
    (fetch as any).mockResolvedValue(new Response(JSON.stringify(expected)));

    const result = await fetchSubmissionQueue(1);

    expect(result).toEqual(expected);
  });
});
