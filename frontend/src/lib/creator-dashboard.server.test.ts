import { fetchCreatorDashboard } from "./creator-dashboard.server";
import { MyTasksError, type MyTask, type MyTasksResponse, type TaskStatusFilter } from "./my-tasks";
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

function listOf(items: MyTask[], total = items.length): MyTasksResponse {
  return { items, page: 1, pageSize: 5, total, totalPages: Math.max(1, Math.ceil(total / 5)) };
}

/** Answers each status with its own total, and the unfiltered list with `all`. */
function tasksApi(
  totals: Partial<Record<TaskStatusFilter, number>>,
  all: MyTasksResponse = listOf([]),
) {
  mockedFetch.mockImplementation(async (_page, status = null) =>
    status === null ? all : listOf([], totals[status] ?? 0),
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
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

  it("asks only for the first page of each card's status, and of the whole list", async () => {
    tasksApi({});

    await fetchCreatorDashboard();

    expect(mockedFetch.mock.calls.map(([page, status]) => [page, status ?? null])).toEqual(
      expect.arrayContaining([
        [1, "scheduled"],
        [1, "draft_revision"],
        [1, "draft_approved"],
        [1, null],
      ]),
    );
    expect(mockedFetch).toHaveBeenCalledTimes(4);
  });

  it("takes the nearest deadline from the first row of the list, which the API orders open work first", async () => {
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

  it("has no nearest deadline when the first row is already finished, so nothing is open", async () => {
    tasksApi({}, listOf([task({ status: "link_submitted", actions: [] })]));

    const dashboard = await fetchCreatorDashboard();

    expect(dashboard.nearestDeadline).toBeNull();
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
