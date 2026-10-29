"use server";

// Server-side only: the creator's "Putuskan" on the Akun Terhubung panel (PBI-19, 19.4), sent to
// 19.3's DELETE /me/social-accounts/:platform with the browser's session and nothing else.
//
// A server action is a public POST endpoint: anyone can call it with any value. So the platform
// and the caller's role are checked here before the backend is asked, and the backend checks
// them again. Every answer is an outcome the page can show, never an exception or the backend's
// own words (OWASP A10:2025).

import { backendDelete } from "./backend.server";
import { DISCONNECT_REFUSALS, MY_SOCIAL_ACCOUNTS_PATH, isConnectPlatform } from "./connected-accounts";
import { currentRole } from "./session.server";

export type DisconnectOutcome = { ok: true } | { ok: false; code: string; message: string };

function refuse(code: string, message: string): DisconnectOutcome {
  return { ok: false, code, message };
}

/** What a backend answer means for the creator. */
function outcomeOf(status: number): DisconnectOutcome {
  // 404: nothing is connected any more, which is where the creator wanted to end.
  if ((status >= 200 && status < 300) || status === 404) return { ok: true };
  if (status === 401) return refuse("UNAUTHENTICATED", DISCONNECT_REFUSALS.UNAUTHENTICATED);
  if (status === 403) return refuse("FORBIDDEN", DISCONNECT_REFUSALS.FORBIDDEN);
  return refuse(`HTTP_${status}`, DISCONNECT_REFUSALS.GENERIC);
}

/**
 * Disconnects one of the signed-in creator's accounts. Only "instagram" or "tiktok" goes into the
 * path, so nothing sent can climb out of /me/social-accounts/ (OWASP A01:2025, A05:2025); a caller
 * with no session is asked to sign in (OWASP A07:2025); an admin is refused, since the accounts
 * are the creator's own (OWASP A01:2025).
 */
export async function disconnectAccount(platform: unknown): Promise<DisconnectOutcome> {
  if (!isConnectPlatform(platform)) return refuse("UNKNOWN_PLATFORM", DISCONNECT_REFUSALS.GENERIC);

  let response: Response;
  try {
    const role = await currentRole();
    if (role === null) return refuse("UNAUTHENTICATED", DISCONNECT_REFUSALS.UNAUTHENTICATED);
    if (role !== "creator") return refuse("FORBIDDEN", DISCONNECT_REFUSALS.FORBIDDEN);

    response = await backendDelete(`${MY_SOCIAL_ACCOUNTS_PATH}/${platform}`);
  } catch {
    return refuse("UNAVAILABLE", DISCONNECT_REFUSALS.GENERIC);
  }
  return outcomeOf(response.status);
}
