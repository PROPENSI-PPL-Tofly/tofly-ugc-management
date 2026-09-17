import { Pagination } from "@/components/creators/pagination";
import { AppShell, CREATOR_NAV } from "@/components/shell/app-shell";
import { TaskTable } from "@/components/tasks/task-table";
import { Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { fetchMyTasks, parseTaskPage, type MyTaskListResponse } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Task Saya — Tofly",
};

// Fetched on the server, like the admin roster, with the page number as the only state in
// the URL. Which creator is asking is decided by the backend.
// TODO(PBI-9): once Google OAuth lands, forward the creator's session with this request.
export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = parseTaskPage(await searchParams);

  let result: MyTaskListResponse | null = null;
  try {
    result = await fetchMyTasks(page);
  } catch {
    result = null;
  }

  return (
    <AppShell
      title="Task Saya"
      subtitle="Semua konten yang perlu kamu kerjakan, deadline terdekat di atas"
      nav={CREATOR_NAV}
      who={{ label: "Creator", initials: "CR" }}
    >
      <Panel>
        <PanelHead
          title="Daftar Tugas Saya"
          hint="Kirim draft saat konten masih Scheduled atau perlu revisi. Link video bisa dikirim setelah draft disetujui, atau mulai H-1 deadline."
        />
        {result ? (
          <>
            <TaskTable tasks={result.items} />
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
              noun="tugas"
            />
          </>
        ) : (
          <PanelBody>
            <p role="alert" className="text-[13px] text-red">
              Daftar tugas tidak dapat dimuat. Coba muat ulang halaman ini.
            </p>
          </PanelBody>
        )}
      </Panel>
    </AppShell>
  );
}
