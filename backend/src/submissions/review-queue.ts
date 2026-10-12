import { BadRequestException } from '@nestjs/common';
import { MAX_SEARCH_LENGTH } from '../creators/filters.js';
import { REVIEWABLE_STATUSES } from './draft-review.js';

export type QueueStatus = (typeof REVIEWABLE_STATUSES)[number];
export type QueueContentType = 'evergreen' | 'specific';

const CONTENT_TYPES: readonly string[] = ['evergreen', 'specific'];

// The same cap every list's search has, defined once beside the Creator Database's filters.
export { MAX_SEARCH_LENGTH };

/** The raw query values, straight from the request. */
export interface QueueQuery {
  status?: unknown;
  q?: unknown;
  type?: unknown;
  resubmitted?: unknown;
  overdue?: unknown;
}

export interface QueueFilters {
  q?: string;
  type?: QueueContentType;
  /** True keeps only resubmits, false only first hand-ins; left out, both are listed. */
  resubmitted?: boolean;
  overdue?: true;
}

function reject(message: string): never {
  throw new BadRequestException(message);
}

/**
 * Validates the raw query values once, at the edge, so the service only ever sees values the
 * queue can actually hold. `status=review` names the queue itself (PRD 3.11); the table's
 * hand-in dropdown travels as `resubmitted`.
 */
export function checkQueueQuery(query: QueueQuery): QueueFilters {
  if (query.status !== 'review') {
    reject('status must be review');
  }

  const filters: QueueFilters = {};

  if (typeof query.q === 'string' && query.q.trim().length > 0) {
    if (query.q.length > MAX_SEARCH_LENGTH) {
      reject(`q must be ${MAX_SEARCH_LENGTH} characters or fewer`);
    }
    filters.q = query.q.trim();
  }

  if (query.type !== undefined) {
    if (!CONTENT_TYPES.includes(query.type as string)) {
      reject(`type must be one of ${CONTENT_TYPES.join(', ')}`);
    }
    filters.type = query.type as QueueContentType;
  }

  if (query.resubmitted !== undefined) {
    if (query.resubmitted !== 'true' && query.resubmitted !== 'false') {
      reject('resubmitted must be true or false');
    }
    filters.resubmitted = query.resubmitted === 'true';
  }

  if (query.overdue !== undefined && query.overdue !== 'false') {
    if (query.overdue !== 'true') {
      reject('overdue must be true or false');
    }
    filters.overdue = true;
  }

  return filters;
}

/** What the ordering needs to know about one queued draft. */
export interface QueueEntry {
  submissionId: string;
  /** Hand-ins after the first one; above zero the draft is a resubmit. */
  revisionCount: number;
  deadline: Date;
  /** When the latest hand-in arrived. */
  submittedAt: Date;
}

/** A draft the creator has handed in again after a revision request. */
export function isResubmit(revisionCount: number): boolean {
  return revisionCount > 0;
}

// A resubmitted draft has already been through one round with the creator, so it is the most
// time-sensitive decision (PRD 3.11 user story). It is yes or no: a third hand-in does not
// outrank a second.
function rank(entry: QueueEntry): number {
  return isResubmit(entry.revisionCount) ? 0 : 1;
}

/** Resubmits first, then nearest deadline, then longest waiting, then id for a stable page. */
export function compareQueueEntries(a: QueueEntry, b: QueueEntry): number {
  return (
    rank(a) - rank(b) ||
    a.deadline.getTime() - b.deadline.getTime() ||
    a.submittedAt.getTime() - b.submittedAt.getTime() ||
    a.submissionId.localeCompare(b.submissionId)
  );
}
