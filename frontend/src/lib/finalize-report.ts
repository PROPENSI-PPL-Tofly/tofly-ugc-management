// What Finalize answers once it has run its last sync and frozen the invoice (PBI-28, 28.2):
// how the sync went and which links it left behind (AC 8), and what it knows of the bonus's
// data gaps (AC 9). Pure module — no fetch — so the dialog and its tests share one reading of
// the answer. Every entry is checked: one that cannot be read is dropped rather than redrawn
// as something (OWASP A05), and an answer from before the report existed reads as none.

import type { MetricName, DataState } from "./link-performance";
import { DATA_STATE_LABELS } from "./link-performance";
import { PLATFORMS, type Platform } from "./platform-links";

/** One frozen link the last sync did not update (28.2's NotUpdatedLinkDto). */
export interface NotUpdatedLink {
  contentId: string;
  contentName: string;
  platform: Platform;
  /** Its state as frozen, which says why it was not updated. */
  state: DataState;
}

/** How Finalize's last sync went beside the frozen invoice (AC 7, 8). */
export interface FinalizeLastSync {
  status: "done" | "failed" | "timed_out";
  notUpdated: NotUpdatedLink[];
}

/** One link eligible for a bonus whose configured metric has no number yet (AC 9). */
export interface WaitingBonusLink {
  contentId: string;
  contentName: string;
  platform: Platform;
  /** The metric the formula judges this platform on. */
  metric: MetricName;
  /** Its state under Finalize's lock: why the number is missing. */
  state: DataState;
}

/**
 * What Finalize knows of the bonus's data gaps (28.2's PBI-28.1 integration point). Until 28.1
 * connects its per-link calculation the answer is `available: false`, naming the dependency —
 * never an empty list, which would read as "nothing is waiting".
 */
export type BonusGaps =
  | { available: false; reason: "PBI_28_1_PENDING" }
  | { available: true; waiting: WaitingBonusLink[] };

/** The report Finalize's answer carries, on its success as on its refusal; null where unread. */
export interface FinalizeReport {
  lastSync: FinalizeLastSync | null;
  bonusGaps: BonusGaps | null;
}

const STATUSES: readonly FinalizeLastSync["status"][] = ["done", "failed", "timed_out"];
const METRICS: readonly MetricName[] = ["views", "likes", "comments", "shares"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNotUpdated(entry: unknown): NotUpdatedLink | null {
  if (!isRecord(entry)) return null;
  const { contentId, contentName, platform, state } = entry;
  if (
    typeof contentId !== "string" ||
    typeof contentName !== "string" ||
    !(PLATFORMS as readonly unknown[]).includes(platform) ||
    !(Object.keys(DATA_STATE_LABELS) as readonly unknown[]).includes(state)
  ) {
    return null;
  }
  return {
    contentId,
    contentName,
    platform: platform as Platform,
    state: state as DataState,
  };
}

function toLastSync(raw: unknown): FinalizeLastSync | null {
  if (!isRecord(raw) || !(STATUSES as readonly unknown[]).includes(raw.status)) return null;
  if (!Array.isArray(raw.notUpdated)) return null;

  return {
    status: raw.status as FinalizeLastSync["status"],
    notUpdated: raw.notUpdated.map(toNotUpdated).filter((entry) => entry !== null),
  };
}

function toWaiting(entry: unknown): WaitingBonusLink | null {
  const link = toNotUpdated(entry);
  if (link === null || !isRecord(entry)) return null;
  const metric = entry.metric;
  return (METRICS as readonly unknown[]).includes(metric)
    ? { ...link, metric: metric as MetricName }
    : null;
}

function toBonusGaps(raw: unknown): BonusGaps | null {
  if (!isRecord(raw)) return null;
  if (raw.available === false) {
    return raw.reason === "PBI_28_1_PENDING"
      ? { available: false, reason: "PBI_28_1_PENDING" }
      : null;
  }
  if (raw.available === true && Array.isArray(raw.waiting)) {
    return {
      available: true,
      waiting: raw.waiting.map(toWaiting).filter((entry) => entry !== null),
    };
  }
  return null;
}

/**
 * The report off Finalize's answer body — the same shape on its success and on its
 * pending-bonus refusal. Each part is read only when it matches; anything else stays null
 * rather than a line the dialog would have made up.
 */
export function toFinalizeReport(body: unknown): FinalizeReport {
  return {
    lastSync: toLastSync(isRecord(body) ? body.lastSync : null),
    bonusGaps: toBonusGaps(isRecord(body) ? body.bonusDataGaps : null),
  };
}
