"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ContentDetailPanel,
  DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { syncContentPerformance } from "@/lib/link-performance-api";
import type { PerformanceLinkRow } from "@/lib/performance-links";
import { LinkPerformanceTable } from "./link-performance-table";

/**
 * "Performa Konten"'s interactive part: the link table plus the Content Detail panel a row
 * press opens (AC 25), and each row's "Sinkronkan" (AC 12-13). The page fetches on the server
 * and cannot hold "which content is open or syncing", so this client component does. A sync
 * refreshes the rows, so every row of that content shows its new numbers and state (AC 24).
 */
export function PerformanceBoard({
  rows,
}: Readonly<{ rows: readonly PerformanceLinkRow[] }>) {
  const router = useRouter();
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  // The one content being synced now: every row of it is held until the answer lands (AC 13).
  const [syncingContentId, setSyncingContentId] = useState<string | null>(null);
  const { show, toast } = useToast();

  /** One press syncs all of the content's links at once (AC 12), and says how it went. */
  async function syncRow(row: PerformanceLinkRow) {
    setSyncingContentId(row.contentId);
    const result = await syncContentPerformance(row.contentId);
    setSyncingContentId(null);
    show(result.ok ? result.toast : result.message);
    if (result.ok) router.refresh();
  }

  return (
    <>
      <LinkPerformanceTable
        rows={rows}
        showCreator
        onRowClick={(row) => setOpenContentId(row.contentId)}
        actions={(row) => (
          <Button
            type="button"
            onClick={() => void syncRow(row)}
            disabled={syncingContentId === row.contentId}
          >
            {syncingContentId === row.contentId ? "Menyinkronkan…" : "Sinkronkan"}
          </Button>
        )}
      />
      {openContentId ? (
        // Keyed by content so switching rows remounts the panel rather than leaving the
        // previous item on screen while the next loads.
        <ContentDetailPanel
          key={openContentId}
          contentId={openContentId}
          role="admin"
          onClose={() => setOpenContentId(null)}
          onDecided={(decision) => {
            setOpenContentId(null);
            show(DECISION_CONFIRMATIONS[decision]);
            router.refresh();
          }}
        />
      ) : null}
      {toast}
    </>
  );
}
