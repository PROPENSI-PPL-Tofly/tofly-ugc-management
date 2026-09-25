import { BadRequestException } from '@nestjs/common';
import { REVIEWABLE_STATUSES } from './draft-review.js';

export type QueueStatus = (typeof REVIEWABLE_STATUSES)[number];
export type QueueContentType = 'evergreen' | 'specific';

const CONTENT_TYPES: readonly string[] = ['evergreen', 'specific'];
const QUEUE_STATUSES: readonly string[] = REVIEWABLE_STATUSES;

/** Nobody searches for a paragraph; a cap keeps a hostile query from driving the scan. */
export const MAX_SEARCH_LENGTH = 100;

/** The raw query values, straight from the request. */
export interface QueueQuery {
  status?: unknown;
  q?: unknown;
  type?: unknown;
  filterStatus?: unknown;
  overdue?: unknown;
}

export interface QueueFilters {
  q?: string;
  type?: QueueContentType;
  /** Narrows the queue to one of its two statuses. */
  status?: QueueStatus;
  overdue?: true;
}

function reject(message: string): never {
  throw new BadRequestException(message);
}

/**
 * Validates the raw query values once, at the edge, so the service only ever sees values the
 * queue can actually hold. `status=review` names the queue itself (PRD 3.11); the table's
 * status dropdown travels as `filterStatus`.
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

  if (query.filterStatus !== undefined) {
    if (!QUEUE_STATUSES.includes(query.filterStatus as string)) {
      reject(`filterStatus must be one of ${QUEUE_STATUSES.join(', ')}`);
    }
    filters.status = query.filterStatus as QueueStatus;
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
  status: QueueStatus;
  deadline: Date;
  /** When the latest hand-in arrived. */
  submittedAt: Date;
}

// A resubmitted draft has already been through one round with the creator, so it is the most
// time-sensitive decision (PRD 3.11 user story). The rank is spelled out here instead of
// sorting on the enum column, whose order would silently change if the enum were reordered.
const STATUS_RANK: Record<QueueStatus, number> = {
  draft_revised: 0,
  draft_review: 1,
};

/** Resubmits first, then nearest deadline, then longest waiting, then id for a stable page. */
export function compareQueueEntries(a: QueueEntry, b: QueueEntry): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    a.deadline.getTime() - b.deadline.getTime() ||
    a.submittedAt.getTime() - b.submittedAt.getTime() ||
    a.submissionId.localeCompare(b.submissionId)
  );
}
