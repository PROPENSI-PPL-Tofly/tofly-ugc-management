"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/components/ui/toast";
import { syncPagePerformance, type PagePerformanceSyncer } from "@/lib/link-performance-api";

const SCOPE_TIP =
  "Hanya link di halaman ini yang disinkronkan, sesuai filter yang dipakai. Link di halaman lain tidak ikut.";

/**
 * "Sinkronkan Sekarang" on "Performa Konten" (SCRUM-285): every link the page shows, as filtered,
 * in one request, with an ⓘ saying the other pages are left out. The page reads again after a
 * sync so the table shows the new numbers.
 */
export function PageSyncButton({
  linkIds,
  sync = syncPagePerformance,
}: Readonly<{
  linkIds: readonly string[];
  sync?: PagePerformanceSyncer;
}>) {
  const router = useRouter();
  const { show, toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  async function syncPage() {
    setSyncing(true);
    const result = await sync(linkIds);
    setSyncing(false);
    show(result.ok ? result.toast : result.message);
    if (result.ok) router.refresh();
  }

  return (
    <span className="flex items-center gap-1.5">
      <Button type="button" onClick={() => void syncPage()} disabled={syncing}>
        {syncing ? "Menyinkronkan…" : "Sinkronkan Sekarang"}
      </Button>
      <InfoTip text={SCOPE_TIP} label="Tentang Sinkronkan Sekarang" align="end" />
      {toast}
    </span>
  );
}
