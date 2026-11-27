// The creator emails a service can ask for (PBI-11, 11.2): each service hands over only the ids it
// already holds, after its action is saved, and CreatorEmails finds the rest. Every method resolves
// whatever happens, so a service never fails because of an email (AC 9).

export interface CreatorNotifier {
  /** AC 1: a draft needs revision. */
  revisionRequested(input: {
    contentId: string;
    submissionId: string;
  }): Promise<void>;
  /** AC 1: a draft gets a follow-up note. */
  followUpAdded(input: {
    contentId: string;
    followUpId: string;
  }): Promise<void>;
  /** AC 1: a draft is approved. */
  draftApproved(input: {
    contentId: string;
    submissionId: string;
  }): Promise<void>;
  /** AC 1: Admin changes the deadline of the creator's content. */
  /** Keyed by the history event of that edit, so each change is its own email (review on #254). */
  contentRescheduled(input: {
    contentId: string;
    deadline: string;
    editId: string;
  }): Promise<void>;
  /** AC 1: Admin deletes the creator's content; it is gone, so its name and deadline come along. */
  contentDeleted(input: {
    contractId: string;
    contentId: string;
    contentName: string;
    deadline: string;
  }): Promise<void>;
  /** AC 1: the creator's account is ready. */
  accountReady(input: { creatorId: string }): Promise<void>;
  /** AC 1: a new contract period is added. */
  periodAdded(input: {
    creatorId: string;
    contractId: string;
    startDate: string;
    endDate: string;
  }): Promise<void>;
  /** AC 1 and AC 4: the last day and the invoice choice, never the reason type or note. */
  contractEndedEarly(input: {
    creatorId: string;
    contractId: string;
    lastDay: string;
    invoice: 'paid' | 'cancelled';
  }): Promise<void>;
  /** PBI-16: Ubah Data moved the end date of the creator's running period. */
  contractEndChanged(input: {
    creatorId: string;
    contractId: string;
    endDate: string;
  }): Promise<void>;
  /** PBI-16: Ubah Data changed how many contents the running period holds. */
  quotaChanged(input: {
    creatorId: string;
    contractId: string;
    quota: number;
  }): Promise<void>;
  /** AC 1: an invoice is finalized and waits for the creator's check. */
  invoiceFinalized(input: { contractId: string }): Promise<void>;
  /** AC 1: Admin uploaded the payment proof. */
  paymentProofUploaded(input: { contractId: string }): Promise<void>;
  /** AC 1 and AC 3: the invoice is Paid; the creator's own move, still emailed (Kania). */
  invoicePaid(input: {
    creatorId: string;
    contractId: string;
    paidAt: Date;
  }): Promise<void>;
}

/** Nest injection token for CreatorNotifier, since an interface does not exist at runtime. */
export const CREATOR_NOTIFIER = Symbol('CREATOR_NOTIFIER');

const nothing = (): Promise<void> => Promise.resolve();

/** For a service built without the email adapter, as unit tests of its own rules do. */
export const noCreatorEmail: CreatorNotifier = {
  revisionRequested: nothing,
  followUpAdded: nothing,
  draftApproved: nothing,
  contentRescheduled: nothing,
  contentDeleted: nothing,
  accountReady: nothing,
  periodAdded: nothing,
  contractEndedEarly: nothing,
  contractEndChanged: nothing,
  quotaChanged: nothing,
  invoiceFinalized: nothing,
  paymentProofUploaded: nothing,
  invoicePaid: nothing,
};
