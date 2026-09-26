import { AppShell } from "@/components/shell/app-shell";
import { MyTaskTable } from "@/components/tasks/my-task-table";
import { buttonClasses } from "@/components/ui/button-classes";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelHead } from "@/components/ui/panel";
import { parsePage } from "@/lib/creators";
import { fetchMyTasks, MyTasksError, type MyTasksResponse } from "@/lib/my-tasks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Task Saya — Tofly",
};

const BASE_PATH = "/creator/tasks";

const NOTICE =
  "mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink";

type Loaded =
  | { kind: "ok"; result: MyTasksResponse; pastEnd: number | null }
  | { kind: "signed_out" }
  | { kind: "failed" };

/**
 * A page past the end (an old link, or a list that shrank) shows the first page instead of an
 * empty table that would claim the creator has nothing to do.
 */
async function load(page: number): Promise<Loaded> {
  try {
    const result = await fetchMyTasks(page);
    if (result.total > 0 && result.page > result.totalPages) {
      return { kind: "ok", result: await fetchMyTasks(1), pastEnd: result.page };
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
        {signedOut ? "Masuk dulu untuk melihat tugasmu." : "Server tidak menjawab."}
      </p>
      {signedOut ? null : (
        <a href={BASE_PATH} className={`mt-4 inline-block ${buttonClasses()}`}>
          Muat ulang
        </a>
      )}
    </div>
  );
}

/**
 * Task Saya (PRD 3.16): every task assigned to the creator, nearest deadline first, five a
 * page, each with the action its status allows. The Submit Draft and Submit Link Video
 * modals (SCRUM-109, SCRUM-132) plug into the table's onAction once they exist.
 */
export default async function TaskSayaPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { page, invalid } = parsePage(await searchParams);
  const loaded = await load(page);

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

      {loaded.kind === "ok" && loaded.pastEnd !== null ? (
        <p role="status" className={NOTICE}>
          Halaman {loaded.pastEnd} tidak ada, menampilkan halaman pertama.
        </p>
      ) : null}

      <Panel>
        <PanelHead title="Daftar Tugas Saya" />
        {loaded.kind === "ok" ? (
          <>
            <MyTaskTable tasks={loaded.result.items} />
            {loaded.result.total > 0 ? (
              <Pagination
                basePath={BASE_PATH}
                noun="tugas"
                page={loaded.result.page}
                pageSize={loaded.result.pageSize}
                total={loaded.result.total}
                totalPages={loaded.result.totalPages}
              />
            ) : null}
          </>
        ) : (
          <LoadFailed signedOut={loaded.kind === "signed_out"} />
        )}
      </Panel>
    </AppShell>
  );
}
