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
 * The breakdown of one creator's running invoice from GET /invoices/:creatorId, or null when
 * there is none to show. A server action can be posted to by anyone with any value, so the
 * caller must be an admin and the id a UUID before the backend is asked: nothing else can reach
 * another path (OWASP A01, A03). A failed request throws, so the popup offers to try again.
 */
export async function loadInvoiceBreakdown(creatorId: string): Promise<InvoiceBreakdown | null> {
  if (typeof creatorId !== "string" || !isUuid(creatorId)) return null;
  if ((await currentRole()) !== "admin") return null;

  const response = await backendGet(`/invoices/${creatorId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Loading the invoice breakdown failed with HTTP ${response.status}`);
  }

  return toInvoiceBreakdown((await response.json()) as RawInvoiceDetail);
}
