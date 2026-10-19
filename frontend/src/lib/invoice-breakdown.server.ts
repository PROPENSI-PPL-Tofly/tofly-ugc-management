"use server";

// Server-side only: one creator's invoice breakdown, read when an admin opens a popup in the
// Rate & Invoicing table (PBI-8, subtask 8.5). A server action rather than a fetch from the
// browser, so the backend's address and the session cookie stay on the server, the way every
// other *.server.ts reads the API.

import { backendGet } from "./backend.server";
import { isUuid } from "./creator-detail";
import { toInvoiceBreakdown, type RawInvoiceDetail } from "./invoice-api";
import type { InvoiceBreakdown } from "./invoice-breakdown";
import { currentRole } from "./session.server";

/**
 * The breakdown of one of a creator's invoices from GET /invoices/:creatorId?contract=…, or null
 * when there is none to show. A renewed creator has one per contract, so the contract is named.
 * A server action can be posted to by anyone with any value, so the caller must be an admin and
 * both ids UUIDs before the backend is asked: nothing else can reach another path or query
 * (OWASP A01, A05). A failed request throws, so the popup offers to try again.
 */
export async function loadInvoiceBreakdown(
  creatorId: string,
  contractId: string,
): Promise<InvoiceBreakdown | null> {
  if (typeof creatorId !== "string" || !isUuid(creatorId)) return null;
  if (typeof contractId !== "string" || !isUuid(contractId)) return null;
  if ((await currentRole()) !== "admin") return null;

  const response = await backendGet(`/invoices/${creatorId}?contract=${contractId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Loading the invoice breakdown failed with HTTP ${response.status}`);
  }

  return toInvoiceBreakdown((await response.json()) as RawInvoiceDetail);
}
