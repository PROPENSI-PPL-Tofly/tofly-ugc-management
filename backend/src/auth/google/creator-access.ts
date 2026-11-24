import { jakartaDay } from '../../creators/evergreen.js';
import type { InvoiceLifecycleStatus } from '../../invoices/invoice-lifecycle.js';

// Whether a creator may sign in: PRD Sprint 4 cross-PBI rule 1, shared by PBI-30 and PBI-37.
// Access follows the contracts. It stays open while a period runs or has not started, or while an
// invoice is not Paid or Cancelled; it closes the day after everything is settled (the prototype's
// "akses login dicabut H+1 setelah Paid"), and at once when a cancelled invoice leaves nothing
// else. A pure rule, no Prisma and no clock, so every case is tested without a database.

/** A contract's invoice as the resolver reads it; null without a row. */
export type BegunInvoice = {
  status: InvoiceLifecycleStatus;
  paid_at: Date | null;
} | null;

/** One of the creator's contracts: its last day (YYYY-MM-DD) and its invoice. */
export interface SignInContract {
  endDay: string;
  invoice: BegunInvoice;
}

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

/** Whether this contract keeps the creator's access open on `today`. */
function keepsAccess({ endDay, invoice }: SignInContract, today: string): boolean {
  // A cancelled invoice is never paid: the period is settled the moment it is cancelled.
  if (invoice?.status === 'cancelled') return false;
  // Postgres date values are calendar days, so they compare as ISO dates.
  return endDay >= today || unsettled(invoice, today);
}

/**
 * @param today the Jakarta day as YYYY-MM-DD
 * @param contracts every contract the creator has; none means nothing to work on or settle
 */
export function creatorMaySignIn(
  today: string,
  contracts: readonly SignInContract[],
): boolean {
  return contracts.some((contract) => keepsAccess(contract, today));
}
