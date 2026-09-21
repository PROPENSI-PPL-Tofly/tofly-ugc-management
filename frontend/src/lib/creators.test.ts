import { fetchCreators, PAGE_SIZE, parsePage, parseFilters, buildCreatorsQuery } from "./creators";

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

describe("parseFilters", () => {
  it("returns defaults for empty params", () => {
    expect(parseFilters({})).toEqual({
      q: "",
      contract: "all",
      productivity: "all",
    });
  });

  it("reads q from URL params", () => {
    expect(parseFilters({ q: "rangga" })).toMatchObject({ q: "rangga" });
  });

  it("reads contract filter", () => {
    expect(parseFilters({ contract: "active" })).toMatchObject({ contract: "active" });
  });

  it("reads productivity filter", () => {
    expect(parseFilters({ productivity: "risk" })).toMatchObject({ productivity: "risk" });
  });

  it("falls back to 'all' for unknown values", () => {
    expect(parseFilters({ contract: "unknown" }).contract).toBe("all");
    expect(parseFilters({ productivity: "unknown" }).productivity).toBe("all");
  });
});

describe("buildCreatorsQuery", () => {
  it("includes page and pageSize", () => {
    const query = buildCreatorsQuery({ page: 2, q: "", contract: "all", productivity: "all" });
    expect(query).toContain("page=2");
    expect(query).toContain(`pageSize=${PAGE_SIZE}`);
  });

  it("includes q when non-empty", () => {
    const query = buildCreatorsQuery({ page: 1, q: "rangga", contract: "all", productivity: "all" });
    expect(query).toContain("q=rangga");
  });

  it("includes contract when not 'all'", () => {
    const query = buildCreatorsQuery({ page: 1, q: "", contract: "active", productivity: "all" });
    expect(query).toContain("contract=active");
  });

  it("includes productivity when not 'all'", () => {
    const query = buildCreatorsQuery({ page: 1, q: "", contract: "all", productivity: "good" });
    expect(query).toContain("productivity=good");
  });

  it("omits q, contract, productivity when at defaults", () => {
    const query = buildCreatorsQuery({ page: 1, q: "", contract: "all", productivity: "all" });
    expect(query).not.toContain("q=");
    expect(query).not.toContain("contract=");
    expect(query).not.toContain("productivity=");
  });
});
