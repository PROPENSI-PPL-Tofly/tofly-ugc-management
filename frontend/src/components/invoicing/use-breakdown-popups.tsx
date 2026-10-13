"use client";

import { useState, type ReactNode } from "react";
import {
  ContentDetailPanel,
  type Decision,
} from "@/components/content-detail/content-detail-panel";
import type { BreakdownKind, InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { BreakdownPopup } from "./breakdown-popup";

interface OpenBreakdown {
  kind: BreakdownKind;
  breakdown: InvoiceBreakdown;
}

/**
 * The breakdown popups of a Rate & Invoicing table (PBI-8, subtask 8.5), held once for every
 * row: `open` is what a BreakdownAmount cell calls, and `layers` is rendered once beside the
 * table. A content's name in a popup opens the shared Content Detail panel over it, so closing
 * the panel returns to the breakdown it was opened from.
 *
 * A decision taken in the panel closes both: it can move a content in or out of a column, and a
 * breakdown left open would show numbers from before it. `onDecided` is where the table reads
 * its invoices again.
 */
export function useBreakdownPopups({
  onDecided,
}: Readonly<{ onDecided?: (decision: Decision) => void }> = {}): {
  open: (kind: BreakdownKind, breakdown: InvoiceBreakdown) => void;
  layers: ReactNode;
} {
  const [popup, setPopup] = useState<OpenBreakdown | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);

  function closeAll() {
    setContentId(null);
    setPopup(null);
  }

  const layers = popup ? (
    <>
      <BreakdownPopup
        kind={popup.kind}
        breakdown={popup.breakdown}
        onClose={closeAll}
        onOpenContent={setContentId}
      />

      {contentId ? (
        // Keyed by content so another name remounts the panel rather than leaving the previous
        // content on screen while the next loads.
        <ContentDetailPanel
          key={contentId}
          contentId={contentId}
          role="admin"
          onClose={() => setContentId(null)}
          onDecided={(decision) => {
            closeAll();
            onDecided?.(decision);
          }}
        />
      ) : null}
    </>
  ) : null;

  return {
    open: (kind, breakdown) => setPopup({ kind, breakdown }),
    layers,
  };
}
