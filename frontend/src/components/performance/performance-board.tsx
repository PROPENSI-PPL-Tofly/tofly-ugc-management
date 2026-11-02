"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ContentDetailPanel,
  DECISION_CONFIRMATIONS,
} from "@/components/content-detail/content-detail-panel";
import { useToast } from "@/components/ui/toast";
import type { PerformanceLinkRow } from "@/lib/performance-links";
import { LinkPerformanceTable } from "./link-performance-table";

/**
 * "Performa Konten"'s interactive part: the link table plus the Content Detail panel a row
 * press opens (AC 25). The page fetches on the server and cannot hold "which content is open",
 * so this client component does. A decision closes the panel and refreshes the rows, so the
 * decided content lands with its new state.
 */
export function PerformanceBoard({
  rows,
}: Readonly<{ rows: readonly PerformanceLinkRow[] }>) {
  const router = useRouter();
  const [openContentId, setOpenContentId] = useState<string | null>(null);
  const { show: confirm, toast } = useToast();

  return (
    <>
      <LinkPerformanceTable
        rows={rows}
        showCreator
        onRowClick={(row) => setOpenContentId(row.contentId)}
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
            confirm(DECISION_CONFIRMATIONS[decision]);
            router.refresh();
          }}
        />
      ) : null}
      {toast}
    </>
  );
}
