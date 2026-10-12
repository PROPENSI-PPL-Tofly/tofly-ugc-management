// The content lifecycle (PBI-6): the statuses a content item can be in and the moves between
// them. Every status list, filter and transition check reads from here, so adding or removing
// a status is a change to this file and to nothing else.

export const CONTENT_STATUSES = [
  'pending',
  'scheduled',
  'draft_review',
  'draft_revision',
  'draft_approved',
  'link_submitted',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/**
 * Content an admin has committed to. A pending proposal is not assigned work yet, so reads of
 * a creator's tasks and progress name these statuses rather than every status.
 */
export const COMMITTED_STATUSES = CONTENT_STATUSES.filter(
  (status): status is Exclude<ContentStatus, 'pending'> => status !== 'pending',
);

/** Narrows an outside value to a status; anything else, a list included, is not one. */
export function isContentStatus(value: unknown): value is ContentStatus {
  return (CONTENT_STATUSES as readonly unknown[]).includes(value);
}

// Where each status may go next. A video link follows an approved draft; from H-1 onward
// (task-actions.ts decides when) it may also skip the approval of a draft that is waiting for
// review. It never skips the draft itself, so content with no draft handed in, or with a
// revision still owed, has no arrow to link_submitted (PBI-7 7.2).
const NEXT_STATUSES: Record<ContentStatus, readonly ContentStatus[]> = {
  pending: ['scheduled'],
  scheduled: ['draft_review'],
  draft_review: ['draft_approved', 'draft_revision', 'link_submitted'],
  draft_revision: ['draft_review'],
  draft_approved: ['link_submitted'],
  // Stryker disable next-line ArrayDeclaration: equivalent mutant. The mutation puts a string that is not a status in this list, and canTransition only ever looks a status up in it, so no call can tell the difference.
  link_submitted: [],
};

/** Whether the lifecycle has an arrow from one status to the other. */
export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

/** The statuses in which a draft waits for an Admin decision. */
export const REVIEWABLE_STATUSES = ['draft_review'] as const;
