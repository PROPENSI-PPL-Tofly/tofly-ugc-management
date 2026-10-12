// What GET /contents answers with, in API vocabulary rather than Prisma's. The Admin Content
// Plan table, its four tabs and their counters read these fields.

import type { ContentStatus } from '../content-lifecycle.js';
import type { ContentListTab, ContentListType } from '../content-list.js';
import type { ContentTag } from '../content-tags.js';

export interface ContentListItem {
  /** The id the Content Detail panel opens by. */
  id: string;
  name: string;
  /** The id the creator filter takes. */
  creatorId: string;
  creatorName: string;
  type: ContentListType;
  /** ISO calendar day. */
  deadline: string;
  /** Raw lifecycle status; the frontend owns its label. */
  status: ContentStatus;
  /** Late, overdue or approval bypassed; empty when nothing is flagged. */
  tags: ContentTag[];
  /** How many times an admin asked for a revision, counted from the moment it is asked. */
  revisionCount: number;
}

export interface ContentListResponse {
  items: ContentListItem[];
  page: number;
  pageSize: number;

  /** Contents in the asked tab that match the search and filters, across every page. */
  total: number;

  totalPages: number;

  /**
   * How many contents each tab holds under the same search and filters, so the number on a tab
   * is the number of rows it lists when opened.
   */
  tabCounts: Record<ContentListTab, number>;
}
