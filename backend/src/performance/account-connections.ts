/** The columns of a social_accounts row that say whether it is connected; no token among them. */
export interface ConnectionRow {
  is_connected: boolean;
  platform_user_id: string | null;
}

export function isConnected(_row: ConnectionRow | undefined): boolean {
  throw new Error('not implemented');
}
