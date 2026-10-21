import { AppShell } from "@/components/shell/app-shell";

/**
 * While the dashboard's numbers are on their way: the creator frame stays, and a line says the
 * summary is loading. No cards are drawn, since cards of zeros would claim there is nothing to do.
 */
export default function CreatorDashboardLoading() {
  return (
    <AppShell role="creator" title="Dashboard" subtitle="Berikut ringkasan task yang perlu kamu kerjakan.">
      <p role="status" className="py-14 text-center text-[13px] text-muted">
        Memuat ringkasan task…
      </p>
    </AppShell>
  );
}
