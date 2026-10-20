// Server-side only: the signed-in creator's invoices, fetched while the Pembayaran page renders.
// It reads the browser's session through next/headers, which client components cannot import,
// so it lives apart from the shared creator-invoice module. Single Responsibility: this module
// fetches and creator-invoice-api translates.

import { backendGet } from "./backend.server";
import { CreatorInvoicesError, type CreatorInvoice } from "./creator-invoice";
import { isRawCreatorInvoices, toCreatorInvoices } from "./creator-invoice-api";

/** Sent when a 200 carries a body the page cannot use. */
const UNUSABLE_ANSWER = 502;

/**
 * Every invoice of the creator the session belongs to. The request names nobody: the backend
 * reads whose invoices these are from the session alone, so no address can reach another
 * creator's (OWASP A01). Any failure throws with its status, so the page can tell a creator who
 * is signed out from a load that failed, and never shows an empty list that would claim there
 * is nothing to be paid.
 */
export async function fetchMyInvoices(): Promise<CreatorInvoice[]> {
  const response = await backendGet("/me/invoices");

  if (!response.ok) {
    throw new CreatorInvoicesError(response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CreatorInvoicesError(UNUSABLE_ANSWER);
  }

  if (!isRawCreatorInvoices(body)) {
    throw new CreatorInvoicesError(UNUSABLE_ANSWER);
  }

  return toCreatorInvoices(body);
}
