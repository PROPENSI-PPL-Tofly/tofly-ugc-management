"use server";

// Server-side only: one creator's invoice breakdown, read when an admin opens a popup in the
// Rate & Invoicing table (PBI-8, subtask 8.5). A server action rather than a fetch from the
// browser, so the backend's address and the session cookie stay on the server, the way every
// other *.server.ts reads the API.
//
// TODO(SCRUM-8.3): the breakdown endpoint does not exist yet, so the fixture answers in its
// place, built from the same rows the table shows. When 8.3 lands, this function asks the
// backend with the session forwarded, and the popups do not change.

import type { InvoiceBreakdown } from "./invoice-breakdown";
import { invoiceBreakdownFixture } from "./invoice-breakdown.fixture";
import { currentRole } from "./session.server";

/**
 * The breakdown of one creator's running invoice, or null when there is none to show. A server
 * action can be posted to by anyone with any value, so the caller must be an admin and the id
 * must be text before anything is read (OWASP A01, A03).
 */
export async function loadInvoiceBreakdown(creatorId: string): Promise<InvoiceBreakdown | null> {
  if (typeof creatorId !== "string") return null;
  if ((await currentRole()) !== "admin") return null;

  return invoiceBreakdownFixture(creatorId);
}
