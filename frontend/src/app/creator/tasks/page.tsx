import { AppShell } from "@/components/shell/app-shell";
import { MyTaskBoard } from "@/components/tasks/my-task-board";
import { MyTaskFilters } from "@/components/tasks/my-task-filters";
import { MyTaskTabBar } from "@/components/tasks/my-task-tab-bar";
import { TaskViewToggle } from "@/components/tasks/task-view-toggle";
import { buttonClasses } from "@/components/ui/button-classes";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelHead } from "@/components/ui/panel";
import { parsePage } from "@/lib/creators";
import { jakartaDay } from "@/lib/format";
import { fetchMyTasks } from "@/lib/my-tasks.server";
import { fetchAllMyTasks } from "@/lib/task-calendar.server";
import { parseTaskView, taskViewParams, type TaskView } from "@/lib/task-view";
import {
  MY_TASKS_BASE,
  MyTasksError,
  buildMyTasksQuery,
  isMyTasksFiltered,
  parseMyTasksParams,
  unknownStatuses,
  type MyTask,
  type MyTasksCounts,
  type MyTasksParams,
  type MyTasksResponse,
} from "@/lib/my-tasks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Task Saya — Tofly",
};

const NOTICE =
    "mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink";

type Loaded =
    | { kind: "ok"; result: MyTasksResponse; pastEnd: number | null }
    | { kind: "calendar"; tasks: MyTask[]; counts: MyTasksCounts }
    | { kind: "signed_out" }
    | { kind: "failed" };

/**
 * A page past the end (an old link, or a list that shrank) shows the first page instead of an
 * empty table that would claim the creator has nothing to do.
 */
async function load(state: MyTasksParams, view: TaskView): Promise<Loaded> {
  // Named periods ("30 hari ke depan") are counted from today where the creators work.
  const today = jakartaDay();
  try {
    // A month is not paged: the calendar reads every task, the table only its page.
    if (view === "calendar") {
      return { kind: "calendar", ...(await fetchAllMyTasks(state, today)) };
    }

    const result = await fetchMyTasks(state, today);

    if (result.total > 0 && result.page > result.totalPages) {
      return {
        kind: "ok",
        result: await fetchMyTasks({ ...state, page: 1 }, today),
        pastEnd: result.page,
      };
    }

    return { kind: "ok", result, pastEnd: null };
  } catch (error) {
    return error instanceof MyTasksError && error.status === 401
        ? { kind: "signed_out" }
        : { kind: "failed" };
  }
}

/**
 * The day a custom deadline range starts on (the earlier day, as the list reads a range picked
 * backwards), or ends on when only the end is picked, for the calendar to open on its month.
 * A named period always reaches into today's month, so it keeps that one.
 */
function rangeStart(state: MyTasksParams): string | null {
  if (state.period !== "custom") return null;
  const days = [state.from, state.to]
    .filter((day) => day !== "")
    .sort((a, b) => a.localeCompare(b));
  return days[0] ?? null;
}

function LoadFailed({ signedOut, retryHref }: Readonly<{ signedOut: boolean; retryHref: string }>) {
  return (
      <div role="alert" className="px-5 py-14 text-center">
        <p className="text-[15px] font-semibold">
          {signedOut ? "Kamu belum masuk sebagai creator." : "Daftar tugas tidak bisa dimuat."}
        </p>

        <p className="mt-1 text-[13px] text-muted">
          {signedOut ? "Masuk dulu untuk melihat tugasmu." : "Coba muat ulang beberapa saat lagi."}
        </p>

        {signedOut ? (
            <a href="/login" className={`mt-4 inline-block ${buttonClasses("accent")}`}>
              Masuk
            </a>
        ) : (
            <a href={retryHref} className={`mt-4 inline-block ${buttonClasses()}`}>
              Muat ulang
            </a>
        )}
      </div>
  );
}

/**
 * Task Saya: every task assigned to the creator, grouped into tabs by whose turn it is,
 * filterable by search, type, status, overdue and period, nearest deadline first unless the
 * creator turns it over, ten a page, each with the action its status allows, or the same tab
 * and filters as a month calendar. The URL is the whole state, so a view can be linked and
 * reloaded. MyTaskBoard opens the Submit/Resubmit Draft or Submit Link Video modal for the
 * pressed button.
 */
export default async function TaskSayaPage({
                                             searchParams,
                                           }: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const { invalid } = parsePage(params);
  const state = parseMyTasksParams(params);
  const invalidStatuses = unknownStatuses(params);
  const view = parseTaskView(params);
  const loaded = await load(state, view);
  const firstPage = buildMyTasksQuery({ ...state, page: 1 });
  const retrySearch = new URLSearchParams({
    ...buildMyTasksQuery(state),
    ...taskViewParams(view),
  }).toString();

  return (
      <AppShell
          role="creator"
          title="Task Saya"
          subtitle="Semua konten yang ditugaskan ke kamu"
      >
        {invalid === null ? null : (
            <p role="status" className={NOTICE}>
              Halaman &#8220;{invalid}&#8221; tidak dikenal, menampilkan halaman pertama.
            </p>
        )}

        {/* Ignored, not "showing everything": a status the page does know still narrows. */}
        {invalidStatuses.length === 0 ? null : (
            <p role="status" className={NOTICE}>
              Status {invalidStatuses.map((status) => `\u201c${status}\u201d`).join(", ")} tidak
              dikenal dan diabaikan.
            </p>
        )}

        {loaded.kind === "ok" && loaded.pastEnd !== null ? (
            <p role="status" className={NOTICE}>
              Halaman {loaded.pastEnd} tidak ada, menampilkan halaman pertama.
            </p>
        ) : null}

        {/* Unclipped: the filter popups hang below the bar and past the panel's foot. */}
        <Panel clip={false}>
          <PanelHead
              title="Daftar Tugas Saya"
              action={<TaskViewToggle view={view} state={state} />}
          />

          {loaded.kind === "calendar" ? (
              <>
                <MyTaskTabBar active={state.tab} counts={loaded.counts} />

                <MyTaskFilters state={state} view={view} />

                <MyTaskBoard
                    tasks={loaded.tasks}
                    tab={state.tab}
                    sort={state.sort}
                    filtered={isMyTasksFiltered(state)}
                    calendarToday={jakartaDay()}
                    calendarOpensOn={rangeStart(state)}
                />
              </>
          ) : null}

          {loaded.kind === "ok" ? (
              <>
                <MyTaskTabBar active={state.tab} counts={loaded.result.counts} />

                <MyTaskFilters state={state} />

                <MyTaskBoard
                    tasks={loaded.result.items}
                    tab={state.tab}
                    sort={state.sort}
                    filtered={isMyTasksFiltered(state)}
                />

                {loaded.result.total > 0 ? (
                    <Pagination
                        basePath={MY_TASKS_BASE}
                        query={firstPage}
                        noun="tugas"
                        page={loaded.result.page}
                        pageSize={loaded.result.pageSize}
                        total={loaded.result.total}
                        totalPages={loaded.result.totalPages}
                    />
                ) : null}
              </>
          ) : null}

          {loaded.kind === "signed_out" || loaded.kind === "failed" ? (
              <LoadFailed
                  signedOut={loaded.kind === "signed_out"}
                  retryHref={retrySearch ? `${MY_TASKS_BASE}?${retrySearch}` : MY_TASKS_BASE}
              />
          ) : null}
        </Panel>
      </AppShell>
  );
}