// Whether each of a creator's Instagram and TikTok accounts is connected (PBI-19, 19.5), as the
// badges in Creator Database and Creator Detail show it. The only reader of the backend's
// answer (19.3), so a change to its shape stops here. Anything missing or malformed reads as
// not connected: 19.3 has not shipped yet, and a bad value should cost a badge, not the page.

import { EMPTY, formatDate, formatTimestamp, jakartaDay } from "./format";

export const SOCIAL_PLATFORMS = ["instagram", "tiktok"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// How each platform is named on the page and to a screen reader.
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

export interface SocialConnection {
  connected: boolean;
  // ISO instants; null when the backend has none or sent something that is not a date.
  connectedAt: string | null;
  // Null until the first sync (PBI-27).
  lastSyncAt: string | null;
}

export type SocialConnections = Record<SocialPlatform, SocialConnection>;

export const NOT_CONNECTED: SocialConnection = {
  connected: false,
  connectedAt: null,
  lastSyncAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function connectionOf(entry: unknown): SocialConnection {
  // Only an explicit true counts: "true" or a missing flag must not show Terhubung.
  if (!isRecord(entry) || entry.connected !== true) return NOT_CONNECTED;
  return {
    connected: true,
    connectedAt: instant(entry.connectedAt),
    lastSyncAt: instant(entry.lastSyncAt),
  };
}

export function readConnections(raw: unknown): SocialConnections {
  const source = isRecord(raw) ? raw : {};
  return Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [
      platform,
      connectionOf(source[platform]),
    ]),
  ) as SocialConnections;
}

// PRD 3.1, AC 10: once connected, the username comes from the platform and Admin may not
// change it (the PBI-16 rule). Nothing calls this yet: the admin form that edits a username
// is PBI-16's, and it reads this to make the field read-only. Not dead code; keep it.
export function isUsernameLocked(connection: SocialConnection): boolean {
  return connection.connected;
}

export function connectionLabel(connection: SocialConnection): string {
  return connection.connected ? "Terhubung" : "Belum terhubung";
}

// Worded as the prototype's badge tooltip. The connection day is Jakarta's, like every other
// day in the app.
export function connectionTooltip(connection: SocialConnection): string {
  if (!connection.connected) {
    return "Creator belum menghubungkan akun ini, jadi angka performanya belum bisa ditarik otomatis.";
  }
  const since = connection.connectedAt
    ? formatDate(jakartaDay(new Date(connection.connectedAt)))
    : EMPTY;
  return `Terhubung sejak ${since} · sinkron terakhir ${formatTimestamp(connection.lastSyncAt)}.`;
}
