import { fetchMyTasks, MY_TASKS_PAGE_SIZE, MyTasksError, type MyTasksResponse } from "./my-tasks";

// GET /me/contents as SCRUM-102 answers it: rows already in display order, each with the
// buttons it allows today, so the table never re-derives the submission rules.
const response: MyTasksResponse = {
  items: [
    {
      id: "content-1",
      name: "Evg_1_RanggaPratama_12102026",
      type: "evergreen",
      brief: "",
      deadline: "2026-10-12",
      status: "scheduled",
      actions: ["submit_draft"],
    },
  ],
  page: 2,
  pageSize: 5,
  total: 6,
  totalPages: 2,
};

describe("MY_TASKS_PAGE_SIZE", () => {
  it("shows five tasks a page, as Task Saya does", () => {
    expect(MY_TASKS_PAGE_SIZE).toBe(5);
  });
});

describe("fetchMyTasks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function respond(status: number, body: unknown) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }

  it("asks the backend for the requested page of five without caching", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const fetchSpy = respond(200, response);

    await expect(fetchMyTasks(2)).resolves.toEqual(response);

    expect(fetchSpy).toHaveBeenCalledWith("http://backend:3001/me/contents?page=2&pageSize=5", {
      cache: "no-store",
    });
  });

  // The backend decides whose tasks these are; the request never names a creator, so no
  // value from the browser can widen it to someone else's work (OWASP A01).
  it("sends no creator identity of its own", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const fetchSpy = respond(200, response);

    await fetchMyTasks(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).not.toMatch(/creator/i);
    expect(init).toEqual({ cache: "no-store" });
  });

  it("keeps a trailing slash on BACKEND_URL from doubling up", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
    const fetchSpy = respond(200, response);

    await fetchMyTasks(1);

    expect(fetchSpy.mock.calls[0][0]).toBe("http://backend:3001/me/contents?page=1&pageSize=5");
  });

  it("refuses to guess the backend address", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(fetchMyTasks(1)).rejects.toThrow("BACKEND_URL is not configured");
  });

  it.each([401, 404, 500, 503])(
    "turns HTTP %i into an error carrying that status",
    async (status) => {
      vi.stubEnv("BACKEND_URL", "http://backend:3001");
      respond(status, { message: "nope" });

      const failure = fetchMyTasks(1);

      await expect(failure).rejects.toBeInstanceOf(MyTasksError);
      await expect(failure).rejects.toMatchObject({ status });
    },
  );

  it("lets a network failure through as a rejection", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(fetchMyTasks(1)).rejects.toThrow("fetch failed");
  });
});
