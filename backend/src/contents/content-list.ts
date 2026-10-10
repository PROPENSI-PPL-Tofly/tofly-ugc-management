// The Admin Content Plan list (PBI-5): which tab a status sits under, and the query a request
// may send. Not written yet; the spec beside this file says what it has to do.

import type { ContentStatus } from './content-lifecycle.js';

export const CONTENT_LIST_TABS = [
  'all',
  'needs_approval',
  'waiting_creator',
  'done',
] as const;

export type ContentListTab = (typeof CONTENT_LIST_TABS)[number];

export const CONTENT_LIST_SORTS = ['deadline_asc', 'deadline_desc'] as const;

export type ContentListSort = (typeof CONTENT_LIST_SORTS)[number];

export type ContentListType = 'evergreen' | 'specific';

export const MAX_SEARCH_LENGTH = 100;
export const MAX_FILTER_VALUES = 50;

export const TAB_STATUSES: Record<ContentListTab, readonly ContentStatus[]> = {
  all: [],
  needs_approval: [],
  waiting_creator: [],
  done: [],
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

export function checkContentListQuery(
  _query: ContentListQuery,
): ContentListFilters {
  return {} as ContentListFilters;
}
