/** The columns that say whether an account is connected. No token is among them, on purpose. */
export const CONNECTION_COLUMNS = {
  is_connected: true,
  platform_user_id: true,
  connected_at: true,
} as const;

export interface ConnectionRow {
  is_connected: boolean;
  platform_user_id: string | null;
  connected_at: Date | null;
}

/** Whether one account is connected, as the Performa panel and Admin's badges read it. */
export interface SocialConnection {
  connected: boolean;
  connectedAt: string | null;
  /** Null until the account's links have synced at least once. */
  lastSyncAt: string | null;
}

/**
 * A row counts as connected only with a platform account behind it. Rows from before PBI-19 can
 * carry the flag with none, and those were never authorized by the creator.
 */
export function connectionOf(row: ConnectionRow): SocialConnection {
  const connected = row.is_connected && row.platform_user_id !== null;
  return {
    connected,
    connectedAt: connected ? (row.connected_at?.toISOString() ?? null) : null,
    lastSyncAt: null,
  };
}

/** A connection with its last sync. An account no longer connected shows none, like its date. */
export function withLastSync(
  connection: SocialConnection,
  lastSync: Date | undefined,
): SocialConnection {
  if (!connection.connected || lastSync === undefined) {
    return connection;
  }
  return { ...connection, lastSyncAt: lastSync.toISOString() };
}
