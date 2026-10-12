import { MyTasksError, type MyTask, type MyTasksResponse } from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";
import { CALENDAR_PAGE_SIZE, fetchAllMyTasks } from "./task-calendar.server";

vi.mock("./my-tasks.server", () => ({ fetchMyTasks: vi.fn() }));

const mockedFetch = vi.mocked(fetchMyTasks);

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
  return { items, page, pageSize: CALENDAR_PAGE_SIZE, total, totalPages };
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

    await expect(fetchAllMyTasks(null)).resolves.toEqual([task("a"), task("b")]);

    expect(mockedFetch).toHaveBeenCalledExactlyOnceWith(1, null, CALENDAR_PAGE_SIZE);
  });

  it("returns an empty list for a creator with no tasks", async () => {
    mockedFetch.mockResolvedValue(pageOf([], 1, 1, 0));

    await expect(fetchAllMyTasks(null)).resolves.toEqual([]);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("reads the later pages too, and hands the tasks back in the order the API lists them", async () => {
    mockedFetch.mockImplementation(async (page) =>
      pageOf([task(`p${page}-1`), task(`p${page}-2`)], page, 3, 6),
    );

    const tasks = await fetchAllMyTasks(null);

    expect(tasks.map((item) => item.id)).toEqual([
      "p1-1",
      "p1-2",
      "p2-1",
      "p2-2",
      "p3-1",
      "p3-2",
    ]);
    expect(mockedFetch.mock.calls.map(([page]) => page)).toEqual([1, 2, 3]);
  });

  it("asks for the later pages together, not one after another", async () => {
    let inFlight = 0;
    let mostAtOnce = 0;
    mockedFetch.mockImplementation(async (page) => {
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return pageOf([task(`p${page}`)], page, 4, 4);
    });

    await fetchAllMyTasks(null);

    // The first page is read alone, since it says how many pages there are; the other three go out together.
    expect(mostAtOnce).toBe(3);
  });

  it("keeps the status filter on every request", async () => {
    mockedFetch.mockImplementation(async (page) => pageOf([task(`p${page}`)], page, 2, 2));

    await fetchAllMyTasks("draft_revision");

    expect(mockedFetch.mock.calls).toEqual([
      [1, "draft_revision", CALENDAR_PAGE_SIZE],
      [2, "draft_revision", CALENDAR_PAGE_SIZE],
    ]);
  });

  it("passes a failed first request on, so the page can tell a signed-out creator from an outage", async () => {
    mockedFetch.mockRejectedValue(new MyTasksError(401));

    await expect(fetchAllMyTasks(null)).rejects.toMatchObject({ status: 401 });
  });

  it("passes a failed later request on, never a calendar missing some of its tasks", async () => {
    mockedFetch.mockImplementation(async (page) => {
      if (page === 2) throw new MyTasksError(500);
      return pageOf([task(`p${page}`)], page, 2, 2);
    });

    await expect(fetchAllMyTasks(null)).rejects.toMatchObject({ status: 500 });
  });
});
