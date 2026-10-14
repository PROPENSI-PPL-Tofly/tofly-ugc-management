"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ContentDetailPanel,
  type Decision,
} from "@/components/content-detail/content-detail-panel";
import type { InvoiceRow } from "@/lib/invoice";
import type { BreakdownKind, InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { loadInvoiceBreakdown } from "@/lib/invoice-breakdown.server";
import { BreakdownPopup, type BreakdownStatus } from "./breakdown-popup";

/** Where a creator's breakdown comes from: null when there is none to show. */
export type BreakdownLoader = (creatorId: string) => Promise<InvoiceBreakdown | null>;

interface OpenBreakdown {
  kind: BreakdownKind;
  row: InvoiceRow;
  /** Null until it arrives, and when there is none. */
  breakdown: InvoiceBreakdown | null;
  status: BreakdownStatus;
}

/**
 * What a breakdown read is kept under: the creator and the four amounts their row shows. While
 * the amounts stay the same the breakdown is reused; once the table is read again with other
 * amounts, the popup asks again, so it can never disagree with the cell it was opened from.
 */
function readKey(row: InvoiceRow): string {
  return [row.creatorId, row.fixedAmount, row.extraAmount, row.bonusAmount, row.penaltyAmount].join("|");
}

/**
 * The breakdown popups of the Rate & Invoicing table (PBI-8, subtask 8.5), held once for every
 * row: `open` is what a BreakdownAmount cell calls, and `layers` is rendered once beside the
 * table. A content's name in a popup opens the shared Content Detail panel in its place, so one
 * layer is on screen at a time, as in the prototype; closing the panel brings the breakdown back.
 *
 * The breakdown is read when a popup opens, not with the table: the table needs four numbers a
 * row, a popup needs every content behind one of them. It is read once per creator and amounts
 * (see readKey), so the other three columns of the same row open at once.
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
    setPopup({ kind, row, breakdown: null, status: "loading" });

    load(row.creatorId).then(
      (breakdown) => {
        if (request !== latest.current) return;
        if (breakdown) read.current.set(readKey(row), breakdown);
        // Null is an answer, not a failure: there is nothing to show, and asking again won't help.
        setPopup({ kind, row, breakdown, status: breakdown ? "ready" : "missing" });
      },
      () => {
        if (request !== latest.current) return;
        setPopup({ kind, row, breakdown: null, status: "failed" });
      },
    );
  }

  function open(kind: BreakdownKind, row: InvoiceRow) {
    const known = read.current.get(readKey(row));
    if (known) {
      latest.current += 1;
      setPopup({ kind, row, breakdown: known, status: "ready" });
      return;
    }
    fetchFor(kind, row);
  }

  function closeAll() {
    latest.current += 1;
    setContentId(null);
    setPopup(null);
  }

  let layers: ReactNode = null;
  if (popup && contentId) {
    // Keyed by content so another name remounts the panel rather than leaving the previous
    // content on screen while the next loads.
    layers = (
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
    );
  } else if (popup) {
    layers = (
      <BreakdownPopup
        kind={popup.kind}
        creatorName={popup.row.creatorName}
        breakdown={popup.breakdown}
        status={popup.status}
        onRetry={() => fetchFor(popup.kind, popup.row)}
        onClose={closeAll}
        onOpenContent={setContentId}
      />
    );
  }

  return { open, layers };
}
