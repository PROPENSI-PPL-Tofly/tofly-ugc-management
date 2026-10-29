// Server-side only: the signed-in creator's connected accounts, fetched while the Performa page
// renders. It reads the session through next/headers, which client components cannot import, so
// it lives apart from the shared connected-accounts module. Single Responsibility: this module
// fetches and connected-accounts translates.

import { backendGet } from "./backend.server";
import {
  ConnectedAccountsError,
  MY_SOCIAL_ACCOUNTS_PATH,
  toConnectedAccounts,
  type ConnectedAccount,
} from "./connected-accounts";

/** Sent when a 200 carries a body the page cannot use. */
const UNUSABLE_ANSWER = 502;

/**
 * Both rows of the Akun Terhubung panel for the creator the session belongs to. The request
 * names nobody, so no address can reach another creator's accounts (OWASP A01:2025). A failed
 * load throws with its status rather than reading as "nothing connected".
 */
export async function fetchMyConnectedAccounts(): Promise<ConnectedAccount[]> {
  const response = await backendGet(MY_SOCIAL_ACCOUNTS_PATH);

  if (!response.ok) {
    throw new ConnectedAccountsError(response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConnectedAccountsError(UNUSABLE_ANSWER);
  }
  return toConnectedAccounts(body);
}
