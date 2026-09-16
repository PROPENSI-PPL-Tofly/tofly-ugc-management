import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Panel, PanelBody, PanelHead } from "@/components/ui/panel";

export const metadata = {
  title: "Content Plan — Tofly",
};

// The destination the creator table links to. The plan itself is another piece of work; this
// exists so the route is real and the journey out of the table is complete rather than
// ending on a 404.
export default function ContentPlanPage() {
  return (
    <AppShell title="Content Plan Creator" subtitle="Kelola alokasi konten untuk satu creator">
      <Link href="/admin/creators" className="mb-3 inline-block text-[12.5px] text-muted hover:text-ink">
        ← Kembali ke Creator Database
      </Link>

      <Panel>
        <PanelHead title="Content Plan" hint="Jadwal konten per creator." />
        <PanelBody>
          <p className="text-[13px] text-muted">
            Halaman Content Plan sedang dikerjakan dan akan tersedia pada iterasi berikutnya.
          </p>
        </PanelBody>
      </Panel>
    </AppShell>
  );
}
