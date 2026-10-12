import {
  DEFAULT_MY_TASKS_PARAMS,
  MyTasksError,
  type MyTask,
  type MyTasksCounts,
  type MyTasksParams,
  type MyTasksResponse,
} from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";
import { CALENDAR_PAGE_SIZE, fetchAllMyTasks } from "./task-calendar.server";

vi.mock("./my-tasks.server", () => ({ fetchMyTasks: vi.fn() }));

const mockedFetch = vi.mocked(fetchMyTasks);

const TODAY = "2026-10-11";
const ALL = DEFAULT_MY_TASKS_PARAMS;
const COUNTS: MyTasksCounts = { all: 6, action: 3, waiting: 2, done: 1 };

function task(id: string): MyTask {
  return {
    id,
    name: `Konten ${id}`,
    type: "specific",
    brief: "",
    deadline: "2026-10-12",
    status: "scheduled",
    tags: [],
    actions: ["submit_draft"],
    revisionNotes: null,
  };
}

function pageOf(items: MyTask[], page: number, totalPages: number, total: number): MyTasksResponse {
  return { items, page, pageSize: CALENDAR_PAGE_SIZE, total, totalPages, counts: COUNTS };
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("CALENDAR_PAGE_SIZE", () => {
  it("asks for the most rows the tasks API hands out in one request", () => {
    expect(CALENDAR_PAGE_SIZE).toBe(50);
  });
});

describe("fetchAllMyTasks", () => {
  it("reads every task in one request when they fit in one page", async () => {
    mockedFetch.mockResolvedValue(pageOf([task("a"), task("b")], 1, 1, 2));

    const { tasks } = await fetchAllMyTasks(ALL, TODAY);

    expect(tasks).toEqual([task("a"), task("b")]);
    expect(mockedFetch).toHaveBeenCalledExactlyOnceWith(ALL, TODAY, CALENDAR_PAGE_SIZE);
  });

  it("returns an empty list for a creator with no tasks", async () => {
    mockedFetch.mockResolvedValue(pageOf([], 1, 1, 0));

    const { tasks } = await fetchAllMyTasks(ALL, TODAY);

    expect(tasks).toEqual([]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("hands back every tab's counter, for the tabs above the calendar", async () => {
    mockedFetch.mockResolvedValue(pageOf([task("a")], 1, 1, 1));

    await expect(fetchAllMyTasks(ALL, TODAY)).resolves.toEqual({
      tasks: [task("a")],
      counts: COUNTS,
    });
  });

  it("reads the later pages too, and hands the tasks back in the order the API lists them", async () => {
    mockedFetch.mockImplementation(async ({ page }) =>
      pageOf([task(`p${page}-1`), task(`p${page}-2`)], page, 3, 6),
    );

    const { tasks } = await fetchAllMyTasks(ALL, TODAY);

    expect(tasks.map((item) => item.id)).toEqual([
      "p1-1",
      "p1-2",
      "p2-1",
      "p2-2",
      "p3-1",
      "p3-2",
    ]);
    expect(mockedFetch.mock.calls.map(([state]) => state.page)).toEqual([1, 2, 3]);
  });

  it("asks for the later pages together, not one after another", async () => {
    let inFlight = 0;
    let mostAtOnce = 0;
    mockedFetch.mockImplementation(async ({ page }) => {
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return pageOf([task(`p${page}`)], page, 4, 4);
    });

    await fetchAllMyTasks(ALL, TODAY);

    // The first page is read alone, since it says how many pages there are; the other three go out together.
    expect(mostAtOnce).toBe(3);
  });

  it("keeps the tab, the search and the filters on every request", async () => {
    const state: MyTasksParams = {
      ...ALL,
      tab: "action",
      q: "serum",
      status: ["draft_revision"],
      period: "next30",
    };
    mockedFetch.mockImplementation(async ({ page }) => pageOf([task(`p${page}`)], page, 2, 2));

    await fetchAllMyTasks(state, TODAY);

    expect(mockedFetch.mock.calls).toEqual([
      [{ ...state, page: 1 }, TODAY, CALENDAR_PAGE_SIZE],
      [{ ...state, page: 2 }, TODAY, CALENDAR_PAGE_SIZE],
    ]);
  });

  it("starts from the first page whatever page of the table the address names", async () => {
    mockedFetch.mockResolvedValue(pageOf([task("a")], 1, 1, 1));

    await fetchAllMyTasks({ ...ALL, page: 4 }, TODAY);

    expect(mockedFetch).toHaveBeenCalledExactlyOnceWith(ALL, TODAY, CALENDAR_PAGE_SIZE);
  });

  it("passes a failed first request on, so the page can tell a signed-out creator from an outage", async () => {
    mockedFetch.mockRejectedValue(new MyTasksError(401));

    await expect(fetchAllMyTasks(ALL, TODAY)).rejects.toMatchObject({ status: 401 });
  });

  it("passes a failed later request on, never a calendar missing some of its tasks", async () => {
    mockedFetch.mockImplementation(async ({ page }) => {
      if (page === 2) throw new MyTasksError(500);
      return pageOf([task(`p${page}`)], page, 2, 2);
    });

    await expect(fetchAllMyTasks(ALL, TODAY)).rejects.toMatchObject({ status: 500 });
  });
});
