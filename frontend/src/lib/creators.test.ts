import { fetchCreators, PAGE_SIZE, parsePage } from "./creators";

describe("parsePage", () => {
  it("defaults to the first page when nothing is given", () => {
    expect(parsePage({})).toEqual({ page: 1, invalid: null });
  });

  it("reads a positive integer", () => {
    expect(parsePage({ page: "3" })).toEqual({ page: 3, invalid: null });
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(parsePage({ page: ["2", "9"] })).toEqual({ page: 2, invalid: null });
  });

  it.each(["abc", "0", "-1", "1.5", "2e1"])(
    "falls back to the first page and reports %s as invalid",
    (raw) => {
      expect(parsePage({ page: raw })).toEqual({ page: 1, invalid: raw });
    },
  );

  it("treats an empty value as absent rather than invalid", () => {
    expect(parsePage({ page: "" })).toEqual({ page: 1, invalid: null });
    expect(parsePage({ page: [] })).toEqual({ page: 1, invalid: null });
  });
});

describe("fetchCreators", () => {
  const response = { items: [], page: 2, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("asks the backend for the requested page without caching", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    await expect(fetchCreators(2)).resolves.toEqual(response);

    expect(fetchSpy).toHaveBeenCalledWith(
      `http://backend:3001/creators?page=2&pageSize=${PAGE_SIZE}`,
      { cache: "no-store" },
    );
  });

  it("keeps a trailing slash on BACKEND_URL from doubling up", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    await fetchCreators(1);

    expect(fetchSpy.mock.calls[0][0]).toBe(
      `http://backend:3001/creators?page=1&pageSize=${PAGE_SIZE}`,
    );
  });

  it("refuses to guess the backend address", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(fetchCreators(1)).rejects.toThrow("BACKEND_URL is not configured");
  });

  it("turns a failed response into an error", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    await expect(fetchCreators(1)).rejects.toThrow("HTTP 503");
  });
});
