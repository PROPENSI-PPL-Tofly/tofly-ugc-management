// The Admin emails a service can ask for (PBI-11 AC 5, 11.2): each service hands over only the ids
// it already holds, after the creator's action is saved, and AdminEmails finds every Admin and the
// rest. Every method resolves whatever happens, so the creator's action never fails (AC 9).

export interface AdminNotifier {
  /** AC 5: a creator handed in a draft (or a new one), so it waits for review. */
  draftSubmitted(input: { contentId: string; submissionId: string }): Promise<void>;
  /** AC 5: a creator acknowledged the invoice, so the payment proof can be uploaded. */
  invoiceAcknowledged(input: { contractId: string }): Promise<void>;
}

/** Nest injection token for AdminNotifier, since an interface does not exist at runtime. */
export const ADMIN_NOTIFIER = Symbol('ADMIN_NOTIFIER');

const nothing = (): Promise<void> => Promise.resolve();

/** For a service built without the email adapter, as unit tests of its own rules do. */
export const noAdminEmail: AdminNotifier = {
  draftSubmitted: nothing,
  invoiceAcknowledged: nothing,
};
