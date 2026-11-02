// Whether a creator's account on one platform is connected, by PBI-19's rule (19.3). A link's
// effective state depends on it; tokens are never read here.

/** The columns of a social_accounts row that say whether it is connected; no token among them. */
export interface ConnectionRow {
  is_connected: boolean;
  platform_user_id: string | null;
}

/** What a read selects for each account, so no query ever asks for a token alongside. */
export const CONNECTION_SELECT = {
  platform: true,
  is_connected: true,
  platform_user_id: true,
} as const;

/**
 * Connected only with the flag and the platform's account id behind it: rows from before PBI-19
 * can carry the flag with no account, and those were never authorized by the creator. No row
 * at all (no account on file for that platform) is not connected either.
 */
export function isConnected(row: ConnectionRow | undefined): boolean {
  return row !== undefined && row.is_connected && row.platform_user_id !== null;
}
