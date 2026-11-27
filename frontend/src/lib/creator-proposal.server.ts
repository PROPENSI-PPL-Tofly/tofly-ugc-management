// Server-side only: the window "Ajukan Konten" opens on (PBI-14, 14.2), read while Task Saya
// renders. It goes through the creator's own /me/invoices and the shared deadline buffer, both
// read with the session through next/headers, so it stays apart from the module the form imports.

import { fetchMyInvoices } from "./creator-invoice.server";
import { proposalWindowFor, type ProposalWindow } from "./creator-proposal";
import { fetchDeadlineBuffer } from "./deadline-buffer.server";

/**
 * The days the creator may propose a deadline on today, or null when they may not propose: no
 * running contract, no day left, or a read that failed. Null hides the button and nothing else,
 * so Task Saya's list still loads; the API judges every proposal again anyway (AC 3).
 */
export async function loadProposalWindow(today: string): Promise<ProposalWindow | null> {
  try {
    const [invoices, bufferDays] = await Promise.all([fetchMyInvoices(), fetchDeadlineBuffer()]);
    return proposalWindowFor(invoices, today, bufferDays);
  } catch {
    return null;
  }
}
