import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Panel, PanelHead } from "@/components/ui/panel";

export const metadata = {
  title: "Content Plan — Tofly",
};

// A placeholder so the Content Plan action from the creator detail dialog lands on a real
// page instead of a 404. The screen itself arrives with the Content Plan work; nothing is
// fetched here on purpose, so there is no contract to keep in step in the meantime.
export default async function ContentPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <AppShell
      title="Content Plan"
      subtitle="Rencana konten creator ini belum tersedia"
    >
      <Panel>
        <PanelHead
          title="Belum tersedia"
          hint="Halaman Content Plan masih dikerjakan. Sementara ini, kembali ke daftar creator untuk melihat kontrak dan progres konten."
        />
        <div className="px-5 pb-5">
          <Link
            href="/admin/creators"
            className="inline-block rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink-2 active:bg-surface-2"
          >
            Kembali ke Creator Database
          </Link>
        </div>
      </Panel>
    </AppShell>
  );
}
