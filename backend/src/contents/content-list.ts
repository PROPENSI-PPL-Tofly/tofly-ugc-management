// The Admin Content Plan list (PBI-5): which tab a status sits under, and the query a request
// may send. Every value is checked here, at the edge, so the service only ever filters by
// values a content can actually hold.

import { MAX_SEARCH_LENGTH } from '../creators/filters.js';
import {
  MAX_FILTER_VALUES,
  deadlineRange,
  isOneOf,
  listOf,
  oneOf,
  overdueOrNot,
  searchText,
  withoutUnset,
} from '../list-query.js';
import { isUuid } from '../uuid.js';
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

export const CONTENT_TYPES = ['evergreen', 'specific'] as const;

export type ContentListType = (typeof CONTENT_TYPES)[number];

// The same caps every list's search and multi-selects have, defined once with the shared checks.
export { MAX_FILTER_VALUES, MAX_SEARCH_LENGTH };

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

/** A tab that holds some of the statuses; Semua holds them all and is nobody's own tab. */
export type StatusTab = Exclude<ContentListTab, 'all'>;

const STATUS_TABS: readonly StatusTab[] = [
  'needs_approval',
  'waiting_creator',
  'done',
];

/**
 * The period filter never narrows this tab, its rows or its counter, so nothing that waits for
 * an admin can be hidden behind a date range.
 */
export const PERIOD_FREE_TAB: StatusTab = 'needs_approval';

/** The one tab besides Semua that lists a status, read off TAB_STATUSES so the two cannot drift. */
export function tabOf(status: ContentStatus): StatusTab {
  return STATUS_TABS.find((tab) =>
    TAB_STATUSES[tab].includes(status),
  ) as StatusTab;
}

/** The raw query values, straight from the request. */
export interface ContentListQuery {
  tab?: unknown;
  q?: unknown;
  creator?: unknown;
  contract?: unknown;
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
  /** One contract period's contents; scopes the rows and every counter. */
  contracts?: string[];
  types?: ContentListType[];
  /** Narrows the rows only; the tab counters are counted without it. */
  statuses?: ContentStatus[];
  /** True keeps what is past its deadline or was finished late, false everything else. */
  overdue?: boolean;
  /** ISO calendar day, inclusive. */
  deadlineFrom?: string;
  /** ISO calendar day, inclusive. */
  deadlineTo?: string;
  sort: ContentListSort;
}

export function isContentType(value: unknown): value is ContentListType {
  return isOneOf(CONTENT_TYPES, value);
}

/**
 * Validates the raw query values once and answers 400 for anything the list cannot hold, so no
 * unchecked text reaches a query or a comparison (OWASP A03).
 */
export function checkContentListQuery(
  query: ContentListQuery,
): ContentListFilters {
  const { deadlineFrom, deadlineTo } = deadlineRange(
    query.deadlineFrom,
    query.deadlineTo,
  );

  return withoutUnset({
    tab: oneOf('tab', CONTENT_LIST_TABS, query.tab, 'all'),
    q: searchText(query.q),
    creators: listOf(
      'creator',
      query.creator,
      isUuid,
      'creator must be a creator id',
    ),
    contracts: listOf(
      'contract',
      query.contract,
      isUuid,
      'contract must be a contract id',
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
    overdue: overdueOrNot(query.overdue),
    deadlineFrom,
    deadlineTo,
    sort: oneOf('sort', CONTENT_LIST_SORTS, query.sort, 'deadline_desc'),
  });
}
