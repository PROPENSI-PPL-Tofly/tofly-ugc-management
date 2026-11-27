// The creator's dashboard cards (PBI-24, AC 11-12): progress against the current contract's
// quota and the running invoice's earnings estimate, with the address of the payment page.

export interface CreatorDashboardCard {
  period: { startDate: string; endDate: string } | null;
  /** Content handed in against what this period owes. */
  sent: number;
  quota: number;
  /** Estimate from the running invoice, never a finalized amount. */
  earningsEstimate: number;
  /** The address of the Pembayaran page the earnings card links to. */
  paymentsHref: string;
}
