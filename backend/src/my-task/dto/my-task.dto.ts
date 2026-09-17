// What the creator's My Task table consumes. As with the admin DTOs, dates are plain calendar
// days and nothing internal to the workflow rides along.

import type { ContentStatus } from '../task-rules.js';

export interface MyTaskDraft {
  link: string;
  /** The creator's own "Catatan untuk Admin" on that draft. */
  creatorNotes: string | null;
  /** ISO calendar day the latest draft was handed in. */
  submittedAt: string;
  /** The admin's note from the latest "Minta Revisi", if any. */
  revisionNotes: string | null;
  /** Hand-ins beyond the first. */
  revisionCount: number;
}

export interface MyTask {
  id: string;
  name: string;
  type: 'evergreen' | 'specific';
  brief: string;
  deadline: string;
  status: ContentStatus;
  /** Negative once the deadline has passed. */
  daysUntilDeadline: number;
  videoLink: string | null;
  platform: 'instagram' | 'tiktok' | null;
  latestDraft: MyTaskDraft | null;
  /**
   * Decided by the server with the same rules the submit endpoints enforce, so the button a
   * creator sees and the answer they get when pressing it can never disagree.
   */
  actions: {
    canSubmitDraft: boolean;
    /** True when the draft button should read "Resubmit Draft". */
    isResubmission: boolean;
    canSubmitVideo: boolean;
    inGracePeriod: boolean;
  };
}

export interface MyTaskListResponse {
  items: MyTask[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
