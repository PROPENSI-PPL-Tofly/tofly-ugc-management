import {
  DEFAULT_MY_TASKS_PARAMS,
  MyTasksError,
  taskStatusLabel,
  type MyTasksResponse,
} from "./my-tasks";
import type { RawMyContents } from "./my-tasks-api";
import { fetchMyTasks } from "./my-tasks.server";
import { cookies } from "next/headers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}));

// GET /me/contents as it answers: rows already in display order, each with the buttons it
// allows today, so the table never re-derives the submission rules, and every tab's counter.
const response: RawMyContents = {
  items: [
    {
      id: "content-1",
      name: "Evg_1_RanggaPratama_12102026",
      type: "evergreen",
      brief: "",
      deadline: "2026-10-12",
      status: "scheduled",
      tags: [],
      actions: ["submit_draft"],
      revisionNotes: null,
    },
  ],
  page: 2,
  pageSize: 10,
  total: 11,
  totalPages: 2,
  tabCounts: { all: 11, to_do: 6, waiting_admin: 2, done: 3 },
};

/** The same answer under the page's names. */
const expected: MyTasksResponse = {
  items: response.items,
  page: 2,
  pageSize: 10,
  total: 11,
  totalPages: 2,
  counts: { all: 11, action: 6, waiting: 2, done: 3 },
};

const TODAY = "2026-10-11";
const FIRST = DEFAULT_MY_TASKS_PARAMS;
const SECOND = { ...DEFAULT_MY_TASKS_PARAMS, page: 2 };

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

  it("asks the backend for the requested page of ten without caching", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const fetchSpy = respond(200, response);

    await expect(fetchMyTasks(SECOND, TODAY)).resolves.toEqual(expected);

    expect(fetchSpy).toHaveBeenCalledWith(
        "http://backend:3001/me/contents?page=2&pageSize=10",
        {
          cache: "no-store",
        },
    );
  });

  it("sends no creator identity of its own", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const fetchSpy = respond(200, response);

    await fetchMyTasks(FIRST, TODAY);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).not.toMatch(/creator/i);
    expect(init).toEqual({
      cache: "no-store",
    });
  });

  it("keeps a trailing slash on BACKEND_URL from doubling up", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
    const fetchSpy = respond(200, response);

    await fetchMyTasks(FIRST, TODAY);

    expect(fetchSpy.mock.calls[0][0]).toBe(
        "http://backend:3001/me/contents?page=1&pageSize=10",
    );
  });

  it("refuses to guess the backend address", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(fetchMyTasks(FIRST, TODAY)).rejects.toThrow(
        "BACKEND_URL is not configured",
    );
  });

  it.each([401, 404, 500, 503])(
      "turns HTTP %i into an error carrying that status",
      async (status) => {
        vi.stubEnv("BACKEND_URL", "http://backend:3001");
        respond(status, { message: "nope" });

        const failure = fetchMyTasks(FIRST, TODAY);

        await expect(failure).rejects.toBeInstanceOf(MyTasksError);
        await expect(failure).rejects.toMatchObject({ status });
      },
  );

  it.each([
    ["an empty object", {}],
    ["a list instead of a page", [response.items[0]]],
    ["items that are not a list", { ...response, items: "nope" }],
    [
      "a task without an id",
      { ...response, items: [{ ...response.items[0], id: undefined }] },
    ],
    [
      "a task without actions",
      { ...response, items: [{ ...response.items[0], actions: null }] },
    ],
    ["paging that is not a number", { ...response, totalPages: "2" }],
    ["no tab counters", { ...response, tabCounts: undefined }],
    ["a tab counter that is not a number", { ...response, tabCounts: { ...response.tabCounts, done: "3" } }],
    ["a tab counter missing", { ...response, tabCounts: { all: 1, to_do: 1, waiting_admin: 1 } }],
    ["no body at all", null],
  ])("refuses %s as an unusable answer", async (_label, body) => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    respond(200, body);

    const failure = fetchMyTasks(FIRST, TODAY);

    await expect(failure).rejects.toBeInstanceOf(MyTasksError);
    await expect(failure).rejects.toMatchObject({ status: 502 });
  });

  it("accepts a page with no tasks", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const empty = {
      ...response,
      items: [],
      total: 0,
      totalPages: 0,
    };

    respond(200, empty);

    await expect(fetchMyTasks(FIRST, TODAY)).resolves.toEqual({
      ...expected,
      items: [],
      total: 0,
      totalPages: 0,
    });
  });

  it("lets a network failure through as a rejection", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new TypeError("fetch failed"),
    );

    await expect(fetchMyTasks(FIRST, TODAY)).rejects.toThrow("fetch failed");
  });

  it("forwards the browser session cookie to the protected backend request", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");

    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [
        {
          name: "__session",
          value: "opaque-session-id",
        },
      ],
    } as Awaited<ReturnType<typeof cookies>>);

    const fetchSpy = respond(200, response);

    await fetchMyTasks(FIRST, TODAY);

    const [, init] = fetchSpy.mock.calls[0];

    expect(new Headers(init?.headers).get("cookie")).toBe(
        "__session=opaque-session-id",
    );
  });
});

describe("fetchMyTasks with filters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks the backend for the tab, filters and sort the page holds, periods counted from today", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");

    const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
            new Response(JSON.stringify(response), { status: 200 }),
        );

    await fetchMyTasks(
      { ...SECOND, tab: "action", status: ["draft_revision"], period: "month", sort: "desc" },
      TODAY,
    );

    expect(fetchSpy.mock.calls[0][0]).toBe(
        "http://backend:3001/me/contents?tab=to_do&status=draft_revision" +
          "&deadlineFrom=2026-10-01&deadlineTo=2026-10-31&sort=deadline_desc&page=2&pageSize=10",
    );
  });
});

describe("fetchMyTasks with a page size", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function respond() {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
  }

  it("asks the backend for as many rows a page as it is told to", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const fetchSpy = respond();

    await fetchMyTasks(FIRST, TODAY, 50);

    expect(fetchSpy.mock.calls[0][0]).toBe("http://backend:3001/me/contents?page=1&pageSize=50");
  });

  it("sends the page size, the tab and the status filter together", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
    const fetchSpy = respond();

    await fetchMyTasks({ ...FIRST, tab: "action", status: ["scheduled"], page: 3 }, TODAY, 50);

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "http://backend:3001/me/contents?tab=to_do&status=scheduled&page=3&pageSize=50",
    );
  });
});

describe("taskStatusLabel", () => {
  it.each([
    ["scheduled", "Scheduled"],
    ["draft_review", "Draft Menunggu Review"],
    ["draft_revision", "Draft Perlu Revisi"],
    ["draft_approved", "Draft Approved"],
    ["link_submitted", "Content Link Submitted"],
  ] as const)("reads %s as %s", (status, label) => {
    expect(taskStatusLabel(status)).toBe(label);
  });
});