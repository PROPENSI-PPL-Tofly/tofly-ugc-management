"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ContentDetailPanel,
  type Decision,
} from "@/components/content-detail/content-detail-panel";
import type { InvoiceRow } from "@/lib/invoice";
import type { BreakdownKind, InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { loadInvoiceBreakdown } from "@/lib/invoice-breakdown.server";
import { BreakdownPopup } from "./breakdown-popup";

/** Where a creator's breakdown comes from: null when there is none to show. */
export type BreakdownLoader = (creatorId: string) => Promise<InvoiceBreakdown | null>;

interface OpenBreakdown {
  kind: BreakdownKind;
  row: InvoiceRow;
  /** Null until it arrives. */
  breakdown: InvoiceBreakdown | null;
  failed: boolean;
}

/**
 * The breakdown popups of the Rate & Invoicing table (PBI-8, subtask 8.5), held once for every
 * row: `open` is what a BreakdownAmount cell calls, and `layers` is rendered once beside the
 * table. A content's name in a popup opens the shared Content Detail panel over it, so closing
 * the panel returns to the breakdown it was opened from.
 *
 * The breakdown is read when a popup opens, not with the table: the table needs four numbers a
 * row, a popup needs every content behind one of them. It is read once per creator, so the
 * other three columns of the same row open at once.
 *
 * A decision taken in the panel closes both and forgets what was read: it can move a content in
 * or out of a column. `onDecided` is where the table reads its invoices again.
 *
 * Dependency Inversion: the loader comes in as a parameter, the server action by default, so a
 * test or another page hands in its own without this hook knowing.
 */
export function useBreakdownPopups({
  load = loadInvoiceBreakdown,
  onDecided,
}: Readonly<{ load?: BreakdownLoader; onDecided?: (decision: Decision) => void }> = {}): {
  open: (kind: BreakdownKind, row: InvoiceRow) => void;
  layers: ReactNode;
} {
  const [popup, setPopup] = useState<OpenBreakdown | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const read = useRef(new Map<string, InvoiceBreakdown>());
  // Only the latest request may fill the popup: an answer for a popup since closed is dropped.
  const latest = useRef(0);

  function fetchFor(kind: BreakdownKind, row: InvoiceRow) {
    const request = ++latest.current;
    setPopup({ kind, row, breakdown: null, failed: false });

    load(row.creatorId).then(
      (breakdown) => {
        if (request !== latest.current) return;
        if (breakdown) read.current.set(row.creatorId, breakdown);
        setPopup({ kind, row, breakdown, failed: breakdown === null });
      },
      () => {
        if (request !== latest.current) return;
        setPopup({ kind, row, breakdown: null, failed: true });
      },
    );
  }

  function open(kind: BreakdownKind, row: InvoiceRow) {
    const known = read.current.get(row.creatorId);
    if (known) {
      latest.current += 1;
      setPopup({ kind, row, breakdown: known, failed: false });
      return;
    }
    fetchFor(kind, row);
  }

  function closeAll() {
    latest.current += 1;
    setContentId(null);
    setPopup(null);
  }

  const layers = popup ? (
    <>
      <BreakdownPopup
        kind={popup.kind}
        creatorName={popup.row.creatorName}
        breakdown={popup.breakdown}
        failed={popup.failed}
        onRetry={() => fetchFor(popup.kind, popup.row)}
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
            read.current.clear();
            closeAll();
            onDecided?.(decision);
          }}
        />
      ) : null}
    </>
  ) : null;

  return { open, layers };
}
