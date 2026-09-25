import { parseSubmissionPage, fetchSubmissionQueue, buildSubmissionQuery, type SubmissionQueueResponse } from "./submissions";

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

describe("buildSubmissionQuery", () => {
  it("includes status=review and page by default", () => {
    expect(buildSubmissionQuery({ page: 1 })).toBe("status=review&page=1");
  });

  it("adds q when provided", () => {
    expect(buildSubmissionQuery({ page: 1, q: "salsa" })).toContain("q=salsa");
  });

  it("adds type when not 'all'", () => {
    expect(buildSubmissionQuery({ page: 1, type: "evergreen" })).toContain("type=evergreen");
  });

  it("omits type when 'all'", () => {
    expect(buildSubmissionQuery({ page: 1, type: "all" })).not.toContain("type=");
  });

  it("adds filterStatus when not 'all'", () => {
    expect(buildSubmissionQuery({ page: 1, status: "draft_revised" })).toContain("filterStatus=draft_revised");
  });

  it("adds overdue when true", () => {
    expect(buildSubmissionQuery({ page: 1, overdue: true })).toContain("overdue=true");
  });
});

describe("fetchSubmissionQueue", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response("")));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("throws when BACKEND_URL is missing", async () => {
    vi.stubEnv("BACKEND_URL", undefined);
    await expect(fetchSubmissionQueue(1)).rejects.toThrow("BACKEND_URL is not configured");
  });

  it("calls the backend with status=review and the requested page", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 2, pageSize: 10, total: 0, totalPages: 1 })),
    );

    await fetchSubmissionQueue(2);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/submissions?status=review&page=2",
      { cache: "no-store" },
    );
  });

  it("forwards q and status in the query", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 })),
    );

    await fetchSubmissionQueue(1, { q: "salsa", status: "draft_revised" });

    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain("q=salsa");
    expect(url).toContain("filterStatus=draft_revised");
  });

  it("throws when the backend responds with an error status", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("", { status: 500 }));

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
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(JSON.stringify(expected)));

    const result = await fetchSubmissionQueue(1);

    expect(result).toEqual(expected);
  });
});
