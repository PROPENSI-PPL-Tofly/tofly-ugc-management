import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { MyTaskBoard } from "@/components/tasks/my-task-board";
import { MyTaskFilters } from "@/components/tasks/my-task-filters";
import { TaskViewToggle } from "@/components/tasks/task-view-toggle";
import { buttonClasses } from "@/components/ui/button-classes";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelHead } from "@/components/ui/panel";
import { parsePage } from "@/lib/creators";
import { jakartaDay } from "@/lib/format";
import { fetchMyTasks } from "@/lib/my-tasks.server";
import { fetchAllMyTasks } from "@/lib/task-calendar.server";
import { parseTaskView, type TaskView } from "@/lib/task-view";
import {
  MyTasksError,
  parseTaskStatus,
  taskStatusLabel,
  type MyTask,
  type MyTasksResponse,
  type TaskStatusFilter,
} from "@/lib/my-tasks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Task Saya — Tofly",
};

const BASE_PATH = "/creator/tasks";

const NOTICE =
    "mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink";

type Loaded =
    | { kind: "ok"; result: MyTasksResponse; pastEnd: number | null }
    | { kind: "calendar"; tasks: MyTask[] }
    | { kind: "signed_out" }
    | { kind: "failed" };

/**
 * A page past the end (an old link, or a list that shrank) shows the first page instead of an
 * empty table that would claim the creator has nothing to do.
 */
async function load(
    page: number,
    status: TaskStatusFilter | null,
    view: TaskView,
): Promise<Loaded> {
  try {
    // A month is not paged: the calendar reads every task, the table only its page.
    if (view === "calendar") {
      return { kind: "calendar", tasks: await fetchAllMyTasks(status) };
    }

    const result = await fetchMyTasks(page, status);

    if (result.total > 0 && result.page > result.totalPages) {
      return {
        kind: "ok",
        result: await fetchMyTasks(1, status),
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

function LoadFailed({ signedOut }: Readonly<{ signedOut: boolean }>) {
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
            <a href={BASE_PATH} className={`mt-4 inline-block ${buttonClasses()}`}>
              Muat ulang
            </a>
        )}
      </div>
  );
}

/**
 * Task Saya (PRD 3.16): every task assigned to the creator, nearest deadline first, five a
 * page, filterable by status, each with the action its status allows. MyTaskBoard opens the
 * Submit/Resubmit Draft or Submit Link Video modal (SCRUM-109, SCRUM-132) for the pressed button.
 */
export default async function TaskSayaPage({
                                             searchParams,
                                           }: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const { page, invalid } = parsePage(params);
  const { status, invalid: invalidStatus } = parseTaskStatus(params);
  const view = parseTaskView(params);
  const loaded = await load(page, status, view);

  return (
      <AppShell
          role="creator"
          title="Task Saya"
          subtitle="Semua konten yang ditugaskan ke kamu, dari deadline terdekat"
      >
        {invalid === null ? null : (
            <p role="status" className={NOTICE}>
              Halaman &#8220;{invalid}&#8221; tidak dikenal, menampilkan halaman pertama.
            </p>
        )}

        {invalidStatus === null ? null : (
            <p role="status" className={NOTICE}>
              Status &#8220;{invalidStatus}&#8221; tidak dikenal, menampilkan semua tugas.
            </p>
        )}

        {loaded.kind === "ok" && loaded.pastEnd !== null ? (
            <p role="status" className={NOTICE}>
              Halaman {loaded.pastEnd} tidak ada, menampilkan halaman pertama.
            </p>
        ) : null}

        <Panel>
          <PanelHead
              title="Daftar Tugas Saya"
              action={<TaskViewToggle view={view} status={status} />}
          />

          {loaded.kind === "calendar" ? (
              <>
                <MyTaskFilters status={status} />

                <MyTaskBoard tasks={loaded.tasks} calendarToday={jakartaDay()} />
              </>
          ) : null}

          {loaded.kind === "ok" ? (
              <>
                <MyTaskFilters status={status} />

                <MyTaskBoard
                    tasks={loaded.result.items}
                    emptyMessage={
                      status ? `Tidak ada tugas berstatus ${taskStatusLabel(status)}.` : undefined
                    }
                    emptyAction={
                      status ? (
                          <Link href={BASE_PATH} className={buttonClasses()}>
                            Tampilkan semua tugas
                          </Link>
                      ) : undefined
                    }
                />

                {loaded.result.total > 0 ? (
                    <Pagination
                        basePath={BASE_PATH}
                        query={status ? { status } : {}}
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
              <LoadFailed signedOut={loaded.kind === "signed_out"} />
          ) : null}
        </Panel>
      </AppShell>
  );
}