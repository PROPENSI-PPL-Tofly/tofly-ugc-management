// What the admin views show of a contract ended early (PBI-37, 37.3): Creator Database and
// Creator Detail read the same API object through this one module, so both say the same thing.
// An early end is only what the API's earlyEnd says (37.1); a moved or past end date never
// makes one (OWASP A06). Pure module, so both pages and the tests share it.

import { EARLY_END_REASON_LABELS } from "./contract-extension";
import { EARLY_END_REASONS, type EarlyEndReason } from "./creators";
import { EMPTY, formatDate, isPlainDay } from "./format";

/** PBI-37's label for a contract ended early. */
export const EARLY_END_LABEL = "Berakhir Lebih Awal";

/**
 * A contract's early end as the admin views show it. The end date the API sends beside it is
 * the new last day; this is the end the contract was agreed to run to, and why it stopped.
 */
export interface EarlyEnd {
  /** Plain calendar day, "YYYY-MM-DD". */
  originalEndDate: string;
  /** Null for a reason this app cannot name; the early end itself still stands. */
  reason: EarlyEndReason | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The API's earlyEnd under the page's names, or null when the contract was not ended early. A
 * broken answer reads as none rather than breaking the row (OWASP A10). Only the two fields the
 * views show are kept: the admin's note never enters the display model.
 */
export function readEarlyEnd(raw: unknown): EarlyEnd | null {
  if (!isRecord(raw)) return null;
  const { originalEndDate, reason } = raw;
  if (typeof originalEndDate !== "string" || !isPlainDay(originalEndDate)) return null;

  return {
    originalEndDate,
    reason: (EARLY_END_REASONS as readonly unknown[]).includes(reason) ? (reason as EarlyEndReason) : null,
  };
}

/** "Berakhir lebih awal pada 20 Nov 2026, semula 31 Des 2026." (AC 16). */
export function earlyEndSentence(lastDay: string | null, earlyEnd: EarlyEnd): string {
  return `Berakhir lebih awal pada ${formatDate(lastDay)}, semula ${formatDate(earlyEnd.originalEndDate)}.`;
}

/** The reason in the early-end form's words, or a dash when it cannot be named. */
export function earlyEndReasonLabel(earlyEnd: EarlyEnd): string {
  return earlyEnd.reason === null ? EMPTY : EARLY_END_REASON_LABELS[earlyEnd.reason];
}
