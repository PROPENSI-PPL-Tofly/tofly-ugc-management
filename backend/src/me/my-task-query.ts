// Task Saya's tabs and the query a creator may send (PBI-7). The tabs are the admin Content
// Plan's seen from the other side: what waits for the creator, what waits for the admin, and
// what is done. Every value is checked here, at the edge, so the service only ever filters by
// values a creator's content can actually hold.

import {
  COMMITTED_STATUSES,
  type ContentStatus,
} from '../contents/content-lifecycle.js';
import {
  CONTENT_TYPES,
  TAB_STATUSES,
  isContentType,
  type ContentListType,
} from '../contents/content-list.js';
import type { DeadlineSort } from '../contents/list-rows.js';
import {
  deadlineRange,
  isOneOf,
  listOf,
  oneOf,
  overdueOrNot,
  searchText,
  withoutUnset,
} from '../list-query.js';

export const MY_TASK_TABS = ['all', 'to_do', 'waiting_admin', 'done'] as const;

export type MyTaskTab = (typeof MY_TASK_TABS)[number];

/** A tab that holds some of the statuses; Semua holds them all and is nobody's own tab. */
export type MyStatusTab = Exclude<MyTaskTab, 'all'>;

const MY_STATUS_TABS: readonly MyStatusTab[] = ['to_do', 'waiting_admin', 'done'];

/** A status a creator can see: anything but a proposal nobody has accepted yet. */
export type MyTaskStatus = (typeof COMMITTED_STATUSES)[number];

/** Keeps only what is assigned work, so a pending proposal never reaches a creator's tab. */
function committed(statuses: readonly ContentStatus[]): MyTaskStatus[] {
  return statuses.filter((status): status is MyTaskStatus =>
    isOneOf(COMMITTED_STATUSES, status),
  );
}

/**
 * Whose turn a content is by its status, read off the admin's tabs so the two sides cannot
 * disagree: what waits for the creator is Perlu Dikerjakan, what waits for the admin is
 * Menunggu Admin. One row leaves its status's tab: a draft in review whose H-1 link is open is
 * the creator's to finish too, and the service lists it under Perlu Dikerjakan.
 */
export const MY_TASK_TAB_STATUSES: Record<MyTaskTab, readonly MyTaskStatus[]> = {
  all: COMMITTED_STATUSES,
  to_do: committed(TAB_STATUSES.waiting_creator),
  waiting_admin: committed(TAB_STATUSES.needs_approval),
  done: committed(TAB_STATUSES.done),
};

/**
 * The period filter never narrows this tab, its rows or its counter, so no work the creator
 * still has to do can be hidden behind a date range.
 */
export const PERIOD_FREE_MY_TAB: MyStatusTab = 'to_do';

/** The one tab besides Semua that lists a status. */
export function myTabOf(status: MyTaskStatus): MyStatusTab {
  return MY_STATUS_TABS.find((tab) =>
    MY_TASK_TAB_STATUSES[tab].includes(status),
  ) as MyStatusTab;
}

/** The raw query values, straight from the request. */
export interface MyTaskQuery {
  tab?: unknown;
  q?: unknown;
  type?: unknown;
  status?: unknown;
  overdue?: unknown;
  deadlineFrom?: unknown;
  deadlineTo?: unknown;
  sort?: unknown;
}

export interface MyTaskFilters {
  tab: MyTaskTab;
  /** Matched against the content's name. */
  q?: string;
  types?: ContentListType[];
  /** Narrows the rows only; the tab counters are counted without it. */
  statuses?: MyTaskStatus[];
  /** True keeps what is past its deadline or was finished late, false everything else. */
  overdue?: boolean;
  /** ISO calendar day, inclusive. */
  deadlineFrom?: string;
  /** ISO calendar day, inclusive. */
  deadlineTo?: string;
  sort: DeadlineSort;
}

const MY_TASK_SORTS: readonly DeadlineSort[] = ['deadline_asc', 'deadline_desc'];

function isMyTaskStatus(value: unknown): value is MyTaskStatus {
  return isOneOf(COMMITTED_STATUSES, value);
}

/**
 * Validates the raw query values once and answers 400 for anything Task Saya cannot hold, a
 * pending proposal included, so no unchecked text reaches a query or a comparison (OWASP A03).
 * The nearest deadline comes first by default: it is what a creator has to deliver next.
 */
export function checkMyTaskQuery(query: MyTaskQuery): MyTaskFilters {
  return withoutUnset({
    tab: oneOf('tab', MY_TASK_TABS, query.tab, 'all'),
    q: searchText(query.q),
    types: listOf(
      'type',
      query.type,
      isContentType,
      `type must be one of ${CONTENT_TYPES.join(', ')}`,
    ),
    statuses: listOf(
      'status',
      query.status,
      isMyTaskStatus,
      `status must be one of ${COMMITTED_STATUSES.join(', ')}`,
    ),
    overdue: overdueOrNot(query.overdue),
    ...deadlineRange(query.deadlineFrom, query.deadlineTo),
    sort: oneOf('sort', MY_TASK_SORTS, query.sort, 'deadline_asc'),
  });
}
