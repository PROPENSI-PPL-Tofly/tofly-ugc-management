/**
 * A video link's performance numbers and data state (PBI-27), as Content Detail shows them on
 * each link's card. Pure module — no fetch, no clock — so the card, the creator's read-only view
 * and the manual input form share one vocabulary and are tested without a DOM. The rules mirror
 * the backend's link-performance.ts, so the form refuses what the API would.
 */

import type { Tone } from "@/components/ui/pill";
import { EMPTY, formatTimestamp } from "./format";

/** One state per link (AC 3), as the API names it. */
export type DataState = "not_connected" | "waiting" | "synced" | "not_found" | "sync_failed" | "manual";

export type MetricName = "views" | "likes" | "comments" | "shares";

/** A link's numbers and state, as GET /contents/:id answers each link's `performance` (27.1). */
export interface LinkPerformance {
  /** Null is no data yet, never 0 (AC 2). */
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  state: DataState;
  lastSyncedAt: string | null;
  manualAt: string | null;
}

export const METRICS: readonly { name: MetricName; label: string }[] = [
  { name: "views", label: "Views" },
  { name: "likes", label: "Likes" },
  { name: "comments", label: "Comments" },
  { name: "shares", label: "Shares" },
];

export const DATA_STATE_LABELS: Record<DataState, string> = {
  not_connected: "Akun belum terhubung",
  waiting: "Menunggu data",
  synced: "Tersinkron",
  not_found: "Link tidak ditemukan",
  sync_failed: "Gagal sinkron",
  manual: "Diisi manual",
};

/**
 * Each state as a badge colour: green when the numbers came in, blue when an admin typed them,
 * amber when the creator has a step to take, red when the platform could not answer, and quiet
 * while it simply has not yet.
 */
export const DATA_STATE_TONES: Record<DataState, Tone> = {
  not_connected: "amber",
  waiting: "neutral",
  synced: "green",
  not_found: "red",
  sync_failed: "red",
  manual: "accent",
};

/**
 * What a creator is told wherever they send or follow their links (PBI-28 AC 13): the numbers
 * count for the bonus only until the invoice is finalized.
 */
export const PERFORMANCE_LOCK_REMINDER =
  "Angka performa dikunci saat invoice difinalisasi. Views yang masuk setelah itu tidak mengubah bonusmu.";

/** The highest number an admin may type (AC 15), as the API holds it. */
export const MAX_METRIC = 999_999_999;

export const FIELD_MESSAGE = "Isi bilangan bulat 0 sampai 999.999.999";
export const NOTHING_FILLED_MESSAGE = "Isi minimal satu angka";

const NUMBER_FORMAT = new Intl.NumberFormat("id-ID");

/** "12.400"; no data is a dash, so an empty number is never read as 0 (AC 2, 19). */
export function formatMetric(value: number | null): string {
  return value === null ? EMPTY : NUMBER_FORMAT.format(value);
}

/** What a state means for this link, for the tip on its label (AC 3). */
export function stateTip(performance: LinkPerformance, creatorFirstName: string): string {
  switch (performance.state) {
    case "synced":
      return `Sinkron terakhir ${formatTimestamp(performance.lastSyncedAt)}. Sinkron otomatis tiap hari 02.00 WIB.`;
    case "manual":
      // Every admin is "Admin" to whoever reads the content, as in the timeline.
      return `Diisi Admin · ${formatTimestamp(performance.manualAt)}.`;
    case "not_connected":
      return `${creatorFirstName} belum menghubungkan akun ini.`;
    case "waiting":
      return "Platform belum mengirim angka. Data Instagram bisa telat sampai 48 jam.";
    case "not_found":
      return "Link tidak cocok dengan video di akun yang terhubung, atau videonya sudah dihapus/diprivate. Angka terakhir tetap disimpan.";
    case "sync_failed":
      return "Platform mengembalikan error. Angka terakhir tetap disimpan dan dicoba lagi di sync berikutnya.";
  }
}

/** The states in which the platform cannot give the numbers, so an admin may type them (AC 14). */
const MANUAL_STATES: ReadonlySet<DataState> = new Set<DataState>([
  "not_connected",
  "not_found",
  "sync_failed",
  "manual",
]);

export function canEnterManually(state: DataState): boolean {
  return MANUAL_STATES.has(state);
}

export type ManualFields = Record<MetricName, string>;
export type ManualValues = Record<MetricName, number | null>;
export type ManualErrors = Partial<Record<MetricName | "metrics", string>>;

/** The form's four fields as numbers, each error worded as the API words it (AC 15). */
export function checkManualInput(fields: ManualFields): { values: ManualValues; errors: ManualErrors } {
  const values: ManualValues = { views: null, likes: null, comments: null, shares: null };
  const errors: ManualErrors = {};

  for (const { name } of METRICS) {
    const typed = fields[name].trim();
    if (typed === "") continue;
    const number = /^\d+$/.test(typed) ? Number(typed) : Number.NaN;
    if (number <= MAX_METRIC) values[name] = number;
    else errors[name] = FIELD_MESSAGE;
  }

  if (Object.keys(errors).length === 0 && METRICS.every(({ name }) => values[name] === null)) {
    errors.metrics = NOTHING_FILLED_MESSAGE;
  }
  return { values, errors };
}
