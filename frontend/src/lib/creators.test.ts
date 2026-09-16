import { buildCreatorsQuery, fetchCreatorDetail, fetchCreators, parseFilters } from "./creators";

describe("parseFilters", () => {
  it("falls back to showing everything", () => {
    expect(parseFilters({})).toEqual({
      q: "",
      contract: "all",
      productivity: "all",
      page: 1,
    });
  });

  it("reads the filters out of the URL", () => {
    expect(parseFilters({ q: "rangga", contract: "active", productivity: "risk", page: "3" })).toEqual(
      { q: "rangga", contract: "active", productivity: "risk", page: 3 },
    );
  });

  it("ignores a filter value the API would reject anyway", () => {
    expect(parseFilters({ contract: "whatever", productivity: "excellent" })).toMatchObject({
      contract: "all",
      productivity: "all",
    });
  });

  it("ignores a page that is not a positive whole number", () => {
    expect(parseFilters({ page: "0" }).page).toBe(1);
    expect(parseFilters({ page: "abc" }).page).toBe(1);
    expect(parseFilters({ page: "-2" }).page).toBe(1);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseFilters({ q: ["rangga", "dimas"] }).q).toBe("rangga");
  });
});

describe("buildCreatorsQuery", () => {
  it("leaves out the filters that are not narrowing anything", () => {
    expect(buildCreatorsQuery({ q: "", contract: "all", productivity: "all", page: 1 })).toBe(
      "pageSize=10",
    );
  });

  it("carries the filters that are set", () => {
    const query = buildCreatorsQuery({
      q: "rangga",
      contract: "active",
      productivity: "good",
      page: 2,
    });

    expect(query).toBe("q=rangga&contract=active&productivity=good&page=2&pageSize=10");
  });

  it("escapes a search term so it cannot alter the query", () => {
    expect(buildCreatorsQuery({ q: "a&b=c", contract: "all", productivity: "all", page: 1 })).toBe(
      "q=a%26b%3Dc&pageSize=10",
    );
  });
});

describe("fetchCreators", () => {
  const response = {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    stats: { total: 0, active: 0, good: 0, risk: 0 },
  };

  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks the backend for the filtered page", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(response)));

    await expect(
      fetchCreators({ q: "rangga", contract: "all", productivity: "all", page: 1 }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:3001/creators?q=rangga&pageSize=10",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails loudly when the backend address is missing", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(
      fetchCreators({ q: "", contract: "all", productivity: "all", page: 1 }),
    ).rejects.toThrow(/BACKEND_URL/);
  });

  it("reports an unhappy backend rather than returning half a page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    await expect(
      fetchCreators({ q: "", contract: "all", productivity: "all", page: 1 }),
    ).rejects.toThrow(/500/);
  });
});

describe("fetchCreatorDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("goes through this app's own proxy, so the browser stays same-origin", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "creator-1" })));

    await fetchCreatorDetail("creator-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/creators/creator-1", expect.anything());
  });

  it("escapes the id instead of pasting it into the path", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({})));

    await fetchCreatorDetail("../health");

    expect(fetchMock).toHaveBeenCalledWith("/api/creators/..%2Fhealth", expect.anything());
  });

  it("raises the failure so the dialog can say something went wrong", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));

    await expect(fetchCreatorDetail("creator-1")).rejects.toThrow(/404/);
  });
});
