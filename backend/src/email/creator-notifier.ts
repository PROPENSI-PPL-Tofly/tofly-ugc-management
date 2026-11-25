// The creator emails a service can ask for (PBI-11, 11.2): each service hands over only the ids it
// already holds, after its action is saved, and CreatorEmails finds the rest. Every method resolves
// whatever happens, so a service never fails because of an email (AC 9).

export interface CreatorNotifier {
  /** AC 1: a draft needs revision. */
  revisionRequested(input: { contentId: string; submissionId: string }): Promise<void>;
  /** AC 1: a draft gets a follow-up note. */
  followUpAdded(input: { contentId: string; followUpId: string }): Promise<void>;
  /** AC 1: a draft is approved. */
  draftApproved(input: { contentId: string; submissionId: string }): Promise<void>;
  /** AC 1: Admin changes the deadline of the creator's content. */
  contentRescheduled(input: { contentId: string; deadline: string }): Promise<void>;
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
};
