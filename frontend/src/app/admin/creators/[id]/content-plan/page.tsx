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
    <AppShell title="Content plan" subtitle="Jadwal konten untuk satu creator">
      <Link
        href="/admin/creators"
        className="mb-4 inline-block text-[13px] font-medium text-blue-deep hover:underline"
      >
        Kembali ke Creator Database
      </Link>

      <Panel>
        <PanelHead title="Content plan" />
        <PanelBody>
          <p className="max-w-[60ch] text-[13px] text-muted">
            Halaman ini sedang dikerjakan. Kembali ke Creator Database untuk melihat kontrak dan
            progres creator sementara itu.
          </p>
        </PanelBody>
      </Panel>
    </AppShell>
  );
}
