import type { Principal } from '../google/ports.js';

export const ACCESS_CHECK = 'ACCESS_CHECK';

/** The whitelist, asked again on each request by the session's user id (PRD 3.1). */
export interface AccessCheck {
  resolveUser(userId: string): Promise<Principal | null>;
}
