// The Admin Content Plan list (PBI-5): which tab a status sits under, and the query a request
// may send. Every value is checked here, at the edge, so the service only ever filters by
// values a content can actually hold.

import { BadRequestException } from '@nestjs/common';
import { isCalendarDay } from '../creators/evergreen.js';
import {
  CONTENT_STATUSES,
  isContentStatus,
  type ContentStatus,
} from './content-lifecycle.js';

export const CONTENT_LIST_TABS = [
  'all',
  'needs_approval',
  'waiting_creator',
  'done',
] as const;

export type ContentListTab = (typeof CONTENT_LIST_TABS)[number];

export const CONTENT_LIST_SORTS = ['deadline_asc', 'deadline_desc'] as const;

export type ContentListSort = (typeof CONTENT_LIST_SORTS)[number];

const CONTENT_TYPES = ['evergreen', 'specific'] as const;

export type ContentListType = (typeof CONTENT_TYPES)[number];

/** Nobody searches for a paragraph; a cap keeps a hostile query from driving the scan. */
export const MAX_SEARCH_LENGTH = 100;

/** No filter has a reason to name more values than this, so a longer list is refused. */
export const MAX_FILTER_VALUES = 50;

/**
 * Who a content waits for decides its tab: the admin (a proposal to answer, a draft to review),
 * the creator, or nobody once the link is in. Semua holds every status.
 */
export const TAB_STATUSES: Record<ContentListTab, readonly ContentStatus[]> = {
  all: CONTENT_STATUSES,
  needs_approval: ['pending', 'draft_review'],
  waiting_creator: ['scheduled', 'draft_revision', 'draft_approved'],
  done: ['link_submitted'],
};

/** The raw query values, straight from the request. */
export interface ContentListQuery {
  tab?: unknown;
  q?: unknown;
  creator?: unknown;
  type?: unknown;
  status?: unknown;
  overdue?: unknown;
  deadlineFrom?: unknown;
  deadlineTo?: unknown;
  sort?: unknown;
}

export interface ContentListFilters {
  tab: ContentListTab;
  q?: string;
  creators?: string[];
  types?: ContentListType[];
  statuses?: ContentStatus[];
  overdue?: true;
  /** ISO calendar day, inclusive. */
  deadlineFrom?: string;
  /** ISO calendar day, inclusive. */
  deadlineTo?: string;
  sort: ContentListSort;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reject(message: string): never {
  throw new BadRequestException(message);
}

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return (allowed as readonly unknown[]).includes(value);
}

/** A value that may be sent once only: left out it takes the fallback, a list is refused. */
function oneOf<T extends string>(
  name: string,
  allowed: readonly T[],
  value: unknown,
  fallback: T,
): T {
  if (value === undefined) {
    return fallback;
  }
  if (!isOneOf(allowed, value)) {
    reject(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

/**
 * A multi-select filter. `?type=a` arrives as text and `?type=a&type=b` as a list, so both are
 * read as a list; anything else the query parser can build (an object, a nested list) fails the
 * element check. Each value is kept once.
 */
function listOf<T extends string>(
  name: string,
  value: unknown,
  accepts: (element: unknown) => element is T,
  problem: string,
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const elements: unknown[] = Array.isArray(value) ? value : [value];
  if (elements.length > MAX_FILTER_VALUES) {
    reject(`${name} takes at most ${MAX_FILTER_VALUES} values`);
  }
  if (!elements.every(accepts)) {
    reject(problem);
  }
  return [...new Set(elements)];
}

function isCreatorId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isContentType(value: unknown): value is ContentListType {
  return isOneOf(CONTENT_TYPES, value);
}

function searchText(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    reject('q must be a single text value');
  }
  if (value.length > MAX_SEARCH_LENGTH) {
    reject(`q must be ${MAX_SEARCH_LENGTH} characters or fewer`);
  }
  return value.trim() || undefined;
}

function calendarDay(name: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !isCalendarDay(value)) {
    reject(`${name} must be a day written as YYYY-MM-DD`);
  }
  return value;
}

function onlyOverdue(value: unknown): true | undefined {
  if (value === undefined || value === 'false') {
    return undefined;
  }
  if (value !== 'true') {
    reject('overdue must be true or false');
  }
  return true;
}

/** Drops the filters nobody asked for, so the result names only what narrows the list. */
function withoutUnset<T extends object>(filters: T): T {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Validates the raw query values once and answers 400 for anything the list cannot hold, so no
 * unchecked text reaches a query or a comparison (OWASP A03).
 */
export function checkContentListQuery(
  query: ContentListQuery,
): ContentListFilters {
  const deadlineFrom = calendarDay('deadlineFrom', query.deadlineFrom);
  const deadlineTo = calendarDay('deadlineTo', query.deadlineTo);
  // ISO days order the same as text and as dates.
  if (deadlineFrom && deadlineTo && deadlineFrom > deadlineTo) {
    reject('deadlineFrom must not be after deadlineTo');
  }

  return withoutUnset({
    tab: oneOf('tab', CONTENT_LIST_TABS, query.tab, 'all'),
    q: searchText(query.q),
    creators: listOf(
      'creator',
      query.creator,
      isCreatorId,
      'creator must be a creator id',
    ),
    types: listOf(
      'type',
      query.type,
      isContentType,
      `type must be one of ${CONTENT_TYPES.join(', ')}`,
    ),
    statuses: listOf(
      'status',
      query.status,
      isContentStatus,
      `status must be one of ${CONTENT_STATUSES.join(', ')}`,
    ),
    overdue: onlyOverdue(query.overdue),
    deadlineFrom,
    deadlineTo,
    sort: oneOf('sort', CONTENT_LIST_SORTS, query.sort, 'deadline_asc'),
  });
}
