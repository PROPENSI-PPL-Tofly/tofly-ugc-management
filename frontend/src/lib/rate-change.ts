// The changes of an invoice's fixed rate (PBI-16 AC 9), as the admin's and the creator's answers
// list them and the invoice's "Aktivitas" tells them. Pure module, shared by both roles.

import type { ActivityEntry } from "./creator-invoice";
import { formatRupiah } from "./format";

export interface RateChange {
  id: string;
  oldRate: number;
  newRate: number;
  /** Null in the creator's answer, which names no admin. */
  actorName: string | null;
  /** ISO instant. */
  createdAt: string;
}

function readRateChange(raw: unknown): RateChange | [] {
  const { id, oldRate, newRate, actorName, createdAt } = (raw ?? {}) as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    typeof oldRate !== "number" ||
    typeof newRate !== "number" ||
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return [];
  }
  return { id, oldRate, newRate, actorName: typeof actorName === "string" ? actorName : null, createdAt };
}

/** What the API lists; an answer without the list has none, and a broken entry is left out. */
export function readRateChanges(raw: unknown): RateChange[] {
  return Array.isArray(raw) ? raw.flatMap(readRateChange) : [];
}

/** Each change as one line of the activity. */
export function rateChangeEvents(changes: readonly RateChange[] = []): ActivityEntry[] {
  return changes.map(({ id, oldRate, newRate, actorName, createdAt }) => ({
    kind: "event",
    id: `rate-${id}`,
    text: `Fixed rate diubah ${formatRupiah(oldRate)} → ${formatRupiah(newRate)} · ${actorName ?? "Admin"}`,
    at: createdAt,
  }));
}
