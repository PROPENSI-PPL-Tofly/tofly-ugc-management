/**
 * What Finalize says about performance data (PBI-28, 28.2 and 28.3): how the last sync went, the
 * links it left as they were, and the links whose bonus still waits. Pure module — the server
 * action reads the answer through it, so only known values ever reach the modal.
 */

import type { DataState, MetricName } from "./link-performance";
import { DATA_STATE_LABELS, METRICS } from "./link-performance";
import { PLATFORMS, type Platform } from "./platform-links";

export type SyncStatus = "done" | "unavailable" | "failed" | "timed_out";

/** One link the admin is told about, with the state it was left in. */
export interface NamedLink {
  contentId: string;
  contentName: string;
  platform: Platform;
  state: DataState;
}

/** A link whose bonus waits for a number on its platform's metric (AC 9). */
export interface WaitingLink extends NamedLink {
  metric: MetricName;
}

export interface LastSyncReport {
  status: SyncStatus;
  notUpdated: NamedLink[];
}

const STATUSES: readonly SyncStatus[] = ["done", "unavailable", "failed", "timed_out"];
const STATES = Object.keys(DATA_STATE_LABELS) as DataState[];
const METRIC_NAMES = METRICS.map(({ name }) => name);

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function namedLink(value: unknown): NamedLink | null {
  if (!isRecord(value)) return null;
  const { contentId, contentName, platform, state } = value;
  if (
    typeof contentId !== "string" ||
    typeof contentName !== "string" ||
    !PLATFORMS.includes(platform as Platform) ||
    !STATES.includes(state as DataState)
  ) {
    return null;
  }
  return { contentId, contentName, platform: platform as Platform, state: state as DataState };
}

const NO_SYNC: LastSyncReport = { status: "unavailable", notUpdated: [] };

/** The answer's `lastSync`, keeping only the links the admin can be told about (OWASP A05). */
export function readLastSync(value: unknown): LastSyncReport {
  if (!isRecord(value) || !STATUSES.includes(value.status as SyncStatus) || !Array.isArray(value.notUpdated)) {
    return NO_SYNC;
  }
  return {
    status: value.status as SyncStatus,
    notUpdated: value.notUpdated.flatMap((item) => namedLink(item) ?? []),
  };
}

/** The refusal's `waiting`: each link whose bonus still waits, with the metric it waits on. */
export function readWaitingLinks(value: unknown): WaitingLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const link = namedLink(item);
    const metric = isRecord(item) ? item.metric : undefined;
    return link && METRIC_NAMES.includes(metric as MetricName) ? [{ ...link, metric: metric as MetricName }] : [];
  });
}

/** One line on what the last sync left as it was; null when there is nothing to say (AC 8). */
export function syncNote({ status, notUpdated }: LastSyncReport): string | null {
  const count = notUpdated.length;
  if (status === "failed") return `Sinkronisasi terakhir gagal. ${count} link memakai angka yang tersimpan.`;
  if (status === "timed_out") {
    return `Sinkronisasi terakhir lebih dari 20 detik. ${count} link memakai angka yang tersimpan.`;
  }
  if (status === "done" && count > 0) {
    return `${count} link tidak diperbarui, jadi invoice memakai angka yang tersimpan.`;
  }
  return null;
}
