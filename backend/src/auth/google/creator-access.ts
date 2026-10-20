import { jakartaDay } from '../../creators/evergreen.js';
import type { InvoiceLifecycleStatus } from '../../invoices/invoice-lifecycle.js';

// Whether a creator may sign in (PRD 3.1, PBI-13). Revoking a creator takes effect once nothing is
// left for them to settle: the prototype's Pembayaran page says "akses login dicabut H+1 setelah
// Paid". Until then they still have to acknowledge their invoice and confirm the payment arrived.
// A pure rule, no Prisma and no clock, so every case is tested without a database.

/** The invoice of one contract that has begun, as the resolver reads it; null without a row. */
export type BegunInvoice = {
  status: InvoiceLifecycleStatus;
  paid_at: Date | null;
} | null;

/** Whether this invoice still needs the creator, on the Jakarta day `today`. */
function unsettled(invoice: BegunInvoice, today: string): boolean {
  return (
    invoice?.status !== 'paid' ||
    // The database never leaves a paid invoice without its moment; if it did, stay open.
    invoice.paid_at === null ||
    // Paid today: access ends tomorrow.
    jakartaDay(invoice.paid_at) >= today
  );
}

/**
 * @param revokeDay the creator's access_revoke_date as YYYY-MM-DD, or null when never revoked
 * @param today the Jakarta day as YYYY-MM-DD
 * @param begun the invoice of every contract that has begun by today
 */
export function creatorMaySignIn(
  revokeDay: string | null,
  today: string,
  begun: readonly BegunInvoice[],
): boolean {
  // Postgres date values are calendar days, so they compare as ISO dates.
  if (revokeDay === null || revokeDay > today) return true;
  return begun.some((invoice) => unsettled(invoice, today));
}
