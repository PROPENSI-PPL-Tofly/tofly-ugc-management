import { fetchMyTasks, formatDeadlineDistance, parseTaskPage } from "./tasks";

describe("parseTaskPage", () => {
  it("starts on the first page", () => {
    expect(parseTaskPage({})).toBe(1);
  });

  it("reads the page out of the URL", () => {
    expect(parseTaskPage({ page: "3" })).toBe(3);
    expect(parseTaskPage({ page: ["2", "9"] })).toBe(2);
  });

  it("ignores a page that is not a positive whole number", () => {
    expect(parseTaskPage({ page: "0" })).toBe(1);
    expect(parseTaskPage({ page: "abc" })).toBe(1);
    expect(parseTaskPage({ page: [] })).toBe(1);
  });
});

describe("formatDeadlineDistance", () => {
  it("counts down in H-n", () => {
    expect(formatDeadlineDistance(3)).toBe("H-3");
    expect(formatDeadlineDistance(1)).toBe("H-1");
  });

  it("calls out the day itself and a missed deadline", () => {
    expect(formatDeadlineDistance(0)).toBe("Hari ini");
    expect(formatDeadlineDistance(-2)).toBe("Lewat 2 hari");
  });
});

describe("fetchMyTasks", () => {
  const body = { items: [], page: 1, pageSize: 5, total: 0, totalPages: 1 };

  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks the backend for five tasks on the first page", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await expect(fetchMyTasks(1)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("http://backend:3001/me/contents?pageSize=5", {
      cache: "no-store",
    });
  });

  it("names later pages", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await fetchMyTasks(3);

    expect(fetchMock.mock.calls[0][0]).toBe("http://backend:3001/me/contents?pageSize=5&page=3");
  });

  it("fails with the status when the backend refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));

    await expect(fetchMyTasks(1)).rejects.toThrow("HTTP 401");
  });

  it("fails clearly without a backend address", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(fetchMyTasks(1)).rejects.toThrow("BACKEND_URL is not configured");
  });
});
