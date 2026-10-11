// What GET /me/contents answers with, in API vocabulary rather than Prisma's. The Task Saya
// table and its Submit Draft / Submit Link Video modals read these fields.

import type { content_status, content_type } from '@prisma/client';
import type { ContentTag } from '../../contents/content-tags.js';
import type { TaskAction } from '../task-actions.js';

export interface MyContentItem {
  /** The id the draft and video endpoints take. */
  id: string;
  name: string;
  type: content_type;
  brief: string;
  /** ISO calendar day. */
  deadline: string;
  /** Raw workflow status; the frontend owns its label. */
  status: content_status;
  /** Late, overdue or approval bypassed, as the admin sees them; empty when nothing is flagged. */
  tags: ContentTag[];
  /** The buttons this row shows today, in display order; empty means none. */
  actions: TaskAction[];
  /** What the admin asked to change; set only while the row awaits a resubmit. */
  revisionNotes: string | null;
}

export interface MyContentsResponse {
  items: MyContentItem[];
  page: number;
  pageSize: number;

  /** The creator's contents across every page. */
  total: number;

  totalPages: number;
}
