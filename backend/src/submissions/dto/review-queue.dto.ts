// What GET /submissions?status=review answers with, in API vocabulary rather than Prisma's.
// Matches the queue table's SubmissionQueueResponse on the frontend.

import type { QueueContentType, QueueStatus } from '../review-queue.js';

export interface ReviewQueueItem {
  /** The content's latest hand-in: the id Draft Preview, approve and revise all take. */
  submissionId: string;
  creatorName: string;
  contentName: string;
  type: QueueContentType;
  /** ISO calendar day. */
  deadline: string;
  status: QueueStatus;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  page: number;
  pageSize: number;

  /** Drafts matching the filters, across every page. */
  total: number;

  totalPages: number;
}
