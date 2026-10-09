import {
  parseSubmissionPage,
  fetchSubmissionQueue,
  buildSubmissionQuery,
  type SubmissionQueueResponse,
} from "./submissions";
import { cookies } from "next/headers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}));

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

  it.each(["true", "false"])("adds resubmitted=%s when asked for", (resubmitted) => {
    expect(buildSubmissionQuery({ page: 1, resubmitted })).toContain(
      `resubmitted=${resubmitted}`,
    );
  });

  it.each(["all", "", "draft_revised", "yes"])(
    "leaves resubmitted out for '%s', which the API would refuse",
    (resubmitted) => {
      expect(buildSubmissionQuery({ page: 1, resubmitted })).not.toContain(
        "resubmitted",
      );
    },
  );

  it("never sends the removed filterStatus", () => {
    expect(
      buildSubmissionQuery({ page: 1, resubmitted: "true" }),
    ).not.toContain("filterStatus");
  });

  it("adds overdue when true", () => {
    expect(buildSubmissionQuery({ page: 1, overdue: true })).toContain("overdue=true");
  });

  it("combines all filters together", () => {
    const result = buildSubmissionQuery({
      page: 2,
      q: "test",
      type: "specific",
      resubmitted: "false",
      overdue: true,
    });

    expect(result).toContain("status=review");
    expect(result).toContain("q=test");
    expect(result).toContain("type=specific");
    expect(result).toContain("resubmitted=false");
    expect(result).toContain("overdue=true");
    expect(result).toContain("page=2");
  });
});

describe("fetchSubmissionQueue", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    vi.spyOn(globalThis, "fetch").mockImplementation(
        () => Promise.resolve(new Response("")),
    );
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
        new Response(
            JSON.stringify({
              items: [],
              page: 2,
              pageSize: 10,
              total: 0,
              totalPages: 1,
            }),
        ),
    );

    await fetchSubmissionQueue(2);

    expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/submissions?status=review&page=2",
        { cache: "no-store" },
    );
  });

  it("strips trailing slash from BACKEND_URL", async () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001/");
    vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
            JSON.stringify({
              items: [],
              page: 1,
              pageSize: 10,
              total: 0,
              totalPages: 0,
            }),
        ),
    );

    await fetchSubmissionQueue(1);

    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toBe("http://localhost:3001/submissions?status=review&page=1");
  });

  it("forwards q and resubmitted in the query", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
            JSON.stringify({
              items: [],
              page: 1,
              pageSize: 10,
              total: 0,
              totalPages: 0,
            }),
        ),
    );

    await fetchSubmissionQueue(1, {
      q: "salsa",
      resubmitted: "true",
    });

    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain("q=salsa");
    expect(url).toContain("resubmitted=true");
  });

  it("forwards type and overdue filters", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
            JSON.stringify({
              items: [],
              page: 1,
              pageSize: 10,
              total: 0,
              totalPages: 0,
            }),
        ),
    );

    await fetchSubmissionQueue(1, {
      type: "specific",
      overdue: true,
    });

    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain("type=specific");
    expect(url).toContain("overdue=true");
  });

  it("throws when the backend responds with an error status", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("", { status: 500 }),
    );

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

    vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(expected)),
    );

    const result = await fetchSubmissionQueue(1);

    expect(result).toEqual(expected);
  });

  it("forwards the browser session cookie to the protected backend request", async () => {
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [
        {
          name: "__session",
          value: "opaque-session-id",
        },
      ],
    } as Awaited<ReturnType<typeof cookies>>);

    vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
            JSON.stringify({
              items: [],
              page: 1,
              pageSize: 10,
              total: 0,
              totalPages: 0,
            }),
        ),
    );

    await fetchSubmissionQueue(1);

    const init = vi.mocked(globalThis.fetch).mock.calls[0][1];

    expect(new Headers(init?.headers).get("cookie")).toBe(
        "__session=opaque-session-id",
    );
  });
});