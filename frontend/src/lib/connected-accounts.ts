// The creator's connected Instagram and TikTok accounts (PBI-19, subtask 19.4): what the Akun
// Terhubung panel on the Performa page shows, and how it reads the result a connect lands back
// with. Everything the backend or the URL hands in is untrusted; anything malformed reads as
// not connected, or as no result at all, rather than breaking the page (OWASP A10:2025).

import { formatDate, formatTimestamp, jakartaDay } from "./format";
// The platforms and their names are shared with Admin's connection badges (19.5), so a new
// platform is added in one place for both sides.
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "./social-connection";

/** The Performa page, where every connect lands back. */
export const PERFORMANCE_PATH = "/creator/performance";

/**
 * The creator's own accounts (19.3). The contract this page assumes until 19.3 lands:
 * `{ accounts: [{ platform, connected, username, connectedAt, lastSyncAt? }] }`, one entry per
 * platform the creator has an account on, tokens never included. `lastSyncAt` stays null until
 * PBI-27 syncs.
 */
export const MY_SOCIAL_ACCOUNTS_PATH = "/me/social-accounts";

/** A load of the creator's accounts that failed, with the backend's status (502 for an unusable 200). */
export class ConnectedAccountsError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Loading your connected accounts failed with HTTP ${status}`);
    this.name = "ConnectedAccountsError";
    this.status = status;
  }
}

/** One row of the panel. */
export interface ConnectedAccount {
  platform: SocialPlatform;
  /** False when the creator has no account on the platform at all (the answer leaves it out). */
  hasAccount: boolean;
  connected: boolean;
  /** The handle the platform reported, or the one typed at Tambah Creator; null when none. */
  username: string | null;
  /** An ISO instant; null when the backend has none or sent something that is not a date. */
  connectedAt: string | null;
  /** The last sync (PBI-27) as an ISO instant; null until one has happened. */
  lastSyncAt: string | null;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is one of the platforms the panel connects, and nothing else. */
export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function noAccount(platform: SocialPlatform): ConnectedAccount {
  return { platform, hasAccount: false, connected: false, username: null, connectedAt: null, lastSyncAt: null };
}

/** An ISO instant, or null for anything that is not one. */
function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function accountOf(platform: SocialPlatform, entry: Json): ConnectedAccount {
  const { connected, username, connectedAt, lastSyncAt } = entry;
  return {
    platform,
    hasAccount: true,
    // Only an explicit true counts: "true" or a missing flag must not show Terhubung.
    connected: connected === true,
    username: typeof username === "string" && username !== "" ? username : null,
    connectedAt: instant(connectedAt),
    lastSyncAt: instant(lastSyncAt),
  };
}

/**
 * GET /me/social-accounts as the panel's rows: always Instagram then TikTok, whatever the
 * answer holds. The only reader of that answer, so a change to its shape stops here (Adapter).
 */
export function toConnectedAccounts(raw: unknown): ConnectedAccount[] {
  const entries = isRecord(raw) && Array.isArray(raw.accounts) ? raw.accounts : [];
  const found = new Map<SocialPlatform, ConnectedAccount>();
  for (const entry of entries) {
    if (isRecord(entry) && isSocialPlatform(entry.platform) && !found.has(entry.platform)) {
      found.set(entry.platform, accountOf(entry.platform, entry));
    }
  }
  return SOCIAL_PLATFORMS.map((platform) => found.get(platform) ?? noAccount(platform));
}

/** Where "Hubungkan" sends the browser: the backend starts the platform's OAuth flow. */
export function connectHref(platform: SocialPlatform): string {
  return `/api/social/${platform}/connect`;
}

/** Why a connect landed back without connecting; the codes the connect flows redirect with. */
export type ConnectError =
  | "cancelled"
  | "not_professional"
  | "not_tester"
  | "account_taken"
  | "platform_error"
  | "connect_failed";

/**
 * PRD 19's wording for each failure, one entry per code (Open/Closed: a new code is one more
 * entry, and Record makes the compiler refuse a code with no words).
 */
const ERROR_MESSAGES: Record<ConnectError, (platform: string) => string> = {
  cancelled: () => "Koneksi dibatalkan",
  not_professional: () => "Akun Instagram harus akun Professional (Business atau Creator)",
  not_tester: () => "Akun ini belum didaftarkan sebagai tester. Hubungi Admin Tofly.",
  account_taken: () => "Akun ini sudah terhubung ke creator lain.",
  platform_error: (platform) => `${platform} sedang bermasalah. Coba lagi nanti.`,
  // A callback that was not this creator's own attempt, or one that expired. PRD 19 and the
  // prototype give it no words, so it reads as the platform error until the PO words it.
  connect_failed: (platform) => `${platform} sedang bermasalah. Coba lagi nanti.`,
};

function isConnectError(value: string): value is ConnectError {
  return Object.hasOwn(ERROR_MESSAGES, value);
}

export type ConnectOutcome =
  | { kind: "connected"; platform: SocialPlatform }
  | { kind: "failed"; platform: SocialPlatform; error: ConnectError };

type Params = Record<string, string | string[] | undefined>;

/** One text value from the query; a repeated or missing key is no value. */
function single(params: Params, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * What a connect landed back on Performa with, or null on a plain visit. Both shapes the connect
 * flows use are read: `?connected=<platform>` (19.2) and `?platform=<platform>&connected=1`
 * (19.1); an error is `?platform=<platform>&error=<code>`. Only known platforms are acted on,
 * since the query is the visitor's to edit.
 */
export function readConnectOutcome(params: Params): ConnectOutcome | null {
  const connected = single(params, "connected");
  const platform = single(params, "platform");

  if (isSocialPlatform(connected)) return { kind: "connected", platform: connected };
  if (connected === "1" && isSocialPlatform(platform)) return { kind: "connected", platform };

  const error = single(params, "error");
  if (error !== undefined && isSocialPlatform(platform)) {
    return { kind: "failed", platform, error: isConnectError(error) ? error : "platform_error" };
  }
  return null;
}

export function connectedToast(platform: SocialPlatform): string {
  return `Akun ${SOCIAL_PLATFORM_LABELS[platform]} berhasil terhubung`;
}

export function connectErrorMessage(platform: SocialPlatform, error: ConnectError): string {
  return ERROR_MESSAGES[error](SOCIAL_PLATFORM_LABELS[platform]);
}

export function disconnectedToast(platform: SocialPlatform): string {
  return `Akun ${SOCIAL_PLATFORM_LABELS[platform]} diputuskan.`;
}

/**
 * Each refusal of a disconnect, worded for the creator. Kept here rather than in the server
 * action's module: a "use server" file may export only async functions, and the panel needs
 * the generic words too, for an action that cannot be reached.
 */
export const DISCONNECT_REFUSALS = {
  GENERIC: "Koneksi tidak bisa diputuskan. Coba lagi.",
  UNAUTHENTICATED: "Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.",
  FORBIDDEN: "Halaman ini hanya untuk Creator",
} as const;

/** PRD 19: what the creator is told before disconnecting. */
export const DISCONNECT_WARNING = "Data performa yang sudah ada tetap disimpan, tapi tidak akan diperbarui lagi.";

/**
 * The line under a platform's name, worded as the Sprint 3 prototype: the handle, and once
 * connected the Jakarta day it connected and the last sync ("—" until PBI-27 has synced). A
 * platform with no account asks for the Admin, who alone can add one.
 */
export function accountDetail(account: ConnectedAccount): string {
  if (!account.hasAccount) {
    return `Belum ada akun ${SOCIAL_PLATFORM_LABELS[account.platform]} di data kamu. Minta Admin menambahkannya dulu.`;
  }
  const handle = account.username ? `@${account.username}` : null;
  if (!account.connected) return handle ?? "";

  const since = account.connectedAt
    ? `terhubung sejak ${formatDate(jakartaDay(new Date(account.connectedAt)))}`
    : "terhubung";
  return [handle, since, `sinkron terakhir ${formatTimestamp(account.lastSyncAt)}`]
    .filter((part) => part !== null)
    .join(" · ");
}
