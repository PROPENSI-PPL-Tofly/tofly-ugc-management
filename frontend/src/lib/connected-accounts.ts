// The creator's connected Instagram and TikTok accounts (PBI-19, subtask 19.4): what the Akun
// Terhubung panel on the Performa page shows, and how it reads the result a connect lands back
// with. Everything the backend or the URL hands in is untrusted; anything malformed reads as
// not connected, or as no result at all, rather than breaking the page (OWASP A10:2025).

import { formatDate, jakartaDay } from "./format";

export const CONNECT_PLATFORMS = ["instagram", "tiktok"] as const;

export type ConnectPlatform = (typeof CONNECT_PLATFORMS)[number];

const PLATFORM_NAMES: Record<ConnectPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** The Performa page, where every connect lands back. */
export const PERFORMANCE_PATH = "/creator/performance";

/**
 * The creator's own accounts (19.3). The contract this page assumes until 19.3 lands:
 * `{ accounts: [{ platform, connected, username, connectedAt }] }`, tokens never included.
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
  platform: ConnectPlatform;
  connected: boolean;
  /** The handle the platform reported, or the one typed at Tambah Creator; null when none. */
  username: string | null;
  /** An ISO instant; null when the backend has none or sent something that is not a date. */
  connectedAt: string | null;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is one of the platforms the panel connects, and nothing else. */
export function isConnectPlatform(value: unknown): value is ConnectPlatform {
  return typeof value === "string" && (CONNECT_PLATFORMS as readonly string[]).includes(value);
}

function notConnected(platform: ConnectPlatform): ConnectedAccount {
  return { platform, connected: false, username: null, connectedAt: null };
}

function accountOf(platform: ConnectPlatform, entry: Json): ConnectedAccount {
  const { connected, username, connectedAt } = entry;
  return {
    platform,
    // Only an explicit true counts: "true" or a missing flag must not show Terhubung.
    connected: connected === true,
    username: typeof username === "string" && username !== "" ? username : null,
    connectedAt: typeof connectedAt === "string" && !Number.isNaN(Date.parse(connectedAt)) ? connectedAt : null,
  };
}

/**
 * GET /me/social-accounts as the panel's rows: always Instagram then TikTok, whatever the
 * answer holds. The only reader of that answer, so a change to its shape stops here (Adapter).
 */
export function toConnectedAccounts(raw: unknown): ConnectedAccount[] {
  const entries = isRecord(raw) && Array.isArray(raw.accounts) ? raw.accounts : [];
  const found = new Map<ConnectPlatform, ConnectedAccount>();
  for (const entry of entries) {
    if (isRecord(entry) && isConnectPlatform(entry.platform) && !found.has(entry.platform)) {
      found.set(entry.platform, accountOf(entry.platform, entry));
    }
  }
  return CONNECT_PLATFORMS.map((platform) => found.get(platform) ?? notConnected(platform));
}

/** Where "Hubungkan" sends the browser: the backend starts the platform's OAuth flow. */
export function connectHref(platform: ConnectPlatform): string {
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
  | { kind: "connected"; platform: ConnectPlatform }
  | { kind: "failed"; platform: ConnectPlatform; error: ConnectError };

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

  if (isConnectPlatform(connected)) return { kind: "connected", platform: connected };
  if (connected === "1" && isConnectPlatform(platform)) return { kind: "connected", platform };

  const error = single(params, "error");
  if (error !== undefined && isConnectPlatform(platform)) {
    return { kind: "failed", platform, error: isConnectError(error) ? error : "platform_error" };
  }
  return null;
}

export function connectedToast(platform: ConnectPlatform): string {
  return `Akun ${PLATFORM_NAMES[platform]} berhasil terhubung`;
}

export function connectErrorMessage(platform: ConnectPlatform, error: ConnectError): string {
  return ERROR_MESSAGES[error](PLATFORM_NAMES[platform]);
}

export function disconnectedToast(platform: ConnectPlatform): string {
  return `Akun ${PLATFORM_NAMES[platform]} diputuskan`;
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

/** "Terhubung sejak 30 Okt 2026", the connection's Jakarta day, as every day in the app is. */
export function connectedSince(connectedAt: string | null): string {
  return connectedAt ? `Terhubung sejak ${formatDate(jakartaDay(new Date(connectedAt)))}` : "Terhubung";
}
