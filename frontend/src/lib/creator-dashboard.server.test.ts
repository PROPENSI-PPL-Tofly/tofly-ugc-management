import { fetchCreatorDashboard } from "./creator-dashboard.server";
import {
  DEFAULT_MY_TASKS_PARAMS,
  MyTasksError,
  type MyTask,
  type MyTasksResponse,
  type TaskStatusFilter,
} from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";

vi.mock("./my-tasks.server", () => ({ fetchMyTasks: vi.fn() }));

const mockedFetch = vi.mocked(fetchMyTasks);

function task(overrides: Partial<MyTask> = {}): MyTask {
  return {
    id: "content-1",
    name: "Evg_1_RanggaPratama_12102026",
    type: "evergreen",
    brief: "",
    deadline: "2026-10-12",
    status: "scheduled",
    tags: [],
    actions: ["submit_draft"],
    revisionNotes: null,
    ...overrides,
  };
}

/** Everything a creator has not finished yet, which is what the nearest deadline is read from. */
const OPEN: TaskStatusFilter[] = ["scheduled", "draft_review", "draft_revision", "draft_approved"];

function listOf(items: MyTask[], total = items.length): MyTasksResponse {
  return {
    items,
    page: 1,
    pageSize: 10,
    total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
    counts: { all: total, action: 0, waiting: 0, done: 0 },
  };
}

/** Answers each single status with its own total, and the unfinished tasks with `open`. */
function tasksApi(
  totals: Partial<Record<TaskStatusFilter, number>>,
  open: MyTasksResponse = listOf([]),
) {
  mockedFetch.mockImplementation(async ({ status }) =>
    status.length === 1 ? listOf([], totals[status[0]] ?? 0) : open,
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
  // Midday in Jakarta on 9 Oct 2026, so "today" is the same day whatever zone the test runs in.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T05:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchCreatorDashboard", () => {
  it("counts each card's status from that status's total", async () => {
    tasksApi({ scheduled: 3, draft_revision: 1, draft_approved: 2 });

    const dashboard = await fetchCreatorDashboard();

    expect(dashboard.counts).toEqual({ scheduled: 3, draft_revision: 1, draft_approved: 2 });
  });

  it("counts a total larger than one page, not the rows it happened to receive", async () => {
    tasksApi({ scheduled: 23 });

    const dashboard = await fetchCreatorDashboard();

    expect(dashboard.counts.scheduled).toBe(23);
  });

  it("asks only for the first page of each card's status, and of the unfinished tasks", async () => {
    tasksApi({});

    await fetchCreatorDashboard();

    expect(mockedFetch.mock.calls.map(([state]) => [state.page, state.status])).toEqual(
      expect.arrayContaining([
        [1, ["scheduled"]],
        [1, ["draft_revision"]],
        [1, ["draft_approved"]],
        [1, OPEN],
      ]),
    );
    expect(mockedFetch).toHaveBeenCalledTimes(4);
  });

  it("asks across every tab with no other filter, counted from today in Jakarta", async () => {
    tasksApi({});

    await fetchCreatorDashboard();

    for (const [state, today] of mockedFetch.mock.calls) {
      expect({ ...state, status: [] }).toEqual(DEFAULT_MY_TASKS_PARAMS);
      expect(today).toBe("2026-10-09");
    }
  });

  it("takes the nearest deadline from the first unfinished row, which the API lists nearest first", async () => {
    tasksApi(
      {},
      listOf([
        task({ deadline: "2026-10-12", status: "draft_revision" }),
        task({ id: "content-2", deadline: "2026-10-20" }),
      ]),
    );

    const dashboard = await fetchCreatorDashboard();

    expect(dashboard.nearestDeadline).toBe("2026-10-12");
  });

  it("has no nearest deadline when the creator has no tasks", async () => {
    tasksApi({});

    const dashboard = await fetchCreatorDashboard();

    expect(dashboard.nearestDeadline).toBeNull();
  });

  it("never reads the nearest deadline off a finished task, however early its deadline was", async () => {
    tasksApi({});

    await fetchCreatorDashboard();

    const statuses = mockedFetch.mock.calls.flatMap(([state]) => state.status);
    expect(statuses).not.toContain("link_submitted");
  });

  it("sends its requests together, not one after another", async () => {
    let inFlight = 0;
    let mostAtOnce = 0;
    mockedFetch.mockImplementation(async () => {
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return listOf([]);
    });

    await fetchCreatorDashboard();

    expect(mostAtOnce).toBe(4);
  });

  it("passes a failed request on, so the page can tell a signed-out creator from an outage", async () => {
    mockedFetch.mockRejectedValue(new MyTasksError(401));

    await expect(fetchCreatorDashboard()).rejects.toMatchObject({ status: 401 });
  });
});
