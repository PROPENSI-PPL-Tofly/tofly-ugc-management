import type { content_status } from '@prisma/client';
import { joinName } from '../creators/evergreen.js';
import { taskActions, type TaskAction } from '../me/task-actions.js';
import { COMMITTED_STATUSES } from './content-lifecycle.js';

// The facts one content item's detail panel needs, assembled without a database: the side the
// step is waiting on, the tags the prototype draws beside the status, and the journey so far.
//
// The journey is derived from what the schema stores today (contents + submissions). PBI 6.3
// replaces this derivation with the append-only event history behind the same response shape;
// the one fact this derivation cannot recover is an approval that a later status change has
// overwritten, so a link_submitted content never claims one (see buildEvents).

export type DetailWaitingOn = 'admin' | 'creator' | null;

export type DetailEventType =
  | 'scheduled'
  | 'draft_submitted'
  | 'revision_requested'
  | 'draft_approved'
  | 'link_submitted';

export interface DetailSubmissionRow {
  id: string;
  link: string;
  created_at: Date;
  updated_at: Date;
  revision_notes: string | null;
}

export interface ContentDetailRow {
  id: string;
  name: string;
  type: 'evergreen' | 'specific';
  brief: string;
  deadline: Date;
  status: content_status;
  video_link: string | null;
  video_submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  contracts: {
    creators: {
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    };
  };
  submissions: DetailSubmissionRow[];
}

export interface ContentEvent {
  id: string;
  type: DetailEventType;
  /** ISO instant; the response lists the newest event first. */
  at: string;
  actor: { name: string | null; role: 'admin' | 'creator' };
  payload?: { version?: number; link?: string; note?: string };
}

export interface ContentTags {
  overdue: boolean;
  lateSubmission: boolean;
  approvalBypassed: boolean;
}

export interface ContentDetail {
  id: string;
  name: string;
  type: 'evergreen' | 'specific';
  brief: string;
  /** ISO calendar day. */
  deadline: string;
  status: content_status;
  creatorName: string;
  tags: ContentTags;
  waitingOn: DetailWaitingOn;
  latestSubmissionId: string | null;
  creatorActions: TaskAction[];
  events: ContentEvent[];
}

// One entry per status, so a status added to the lifecycle cannot be left without an answer.
const WAITING_ON: Record<content_status, DetailWaitingOn> = {
  pending: 'admin',
  scheduled: 'creator',
  draft_review: 'admin',
  draft_revision: 'creator',
  draft_approved: 'creator',
  link_submitted: null,
};

/** Whose turn the step is on; nothing is waiting once the link has closed the content. */
export function waitingOnFor(status: content_status): DetailWaitingOn {
  return WAITING_ON[status];
}

/**
 * Deadline passed with no final link in yet, on work the creator is committed to: a pending
 * proposal has not been accepted. ISO days compare correctly as strings.
 */
export function isOverdue(
  status: content_status,
  deadlineDay: string,
  today: string,
): boolean {
  const committed = (COMMITTED_STATUSES as readonly content_status[]).includes(status);
  return committed && status !== 'link_submitted' && today > deadlineDay;
}

/** A revision note that says nothing has nothing to request. */
function hasNote(submission: DetailSubmissionRow): boolean {
  return Boolean(submission.revision_notes?.trim());
}

/**
 * The journey, newest first. Submissions arrive oldest-first from the query, so versions
 * count up along the way and the sort at the end flips the list for the panel.
 */
export function buildEvents(
  row: Pick<
    ContentDetailRow,
    'id' | 'status' | 'created_at' | 'updated_at' | 'video_link' | 'video_submitted_at' | 'contracts' | 'submissions'
  >,
): ContentEvent[] {
  const creatorName = joinName(row.contracts.creators);
  const events: ContentEvent[] = [
    {
      id: `${row.id}:scheduled`,
      type: 'scheduled',
      at: row.created_at.toISOString(),
      actor: { name: null, role: 'admin' },
    },
  ];

  const ordered = [...row.submissions].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id),
  );

  ordered.forEach((submission, index) => {
    events.push({
      id: submission.id,
      type: 'draft_submitted',
      at: submission.created_at.toISOString(),
      actor: { name: creatorName, role: 'creator' },
      payload: { version: index + 1, link: submission.link },
    });

    if (hasNote(submission)) {
      events.push({
        id: `${submission.id}:revision`,
        type: 'revision_requested',
        at: submission.updated_at.toISOString(),
        actor: { name: null, role: 'admin' },
        payload: { note: submission.revision_notes ?? '' },
      });
    }
  });

  // Approving overwrites the status, and every later transition overwrites it again, so an
  // approval is only provable while the content still stands in Draft Approved.
  if (row.status === 'draft_approved') {
    events.push({
      id: `${row.id}:approved`,
      type: 'draft_approved',
      at: row.updated_at.toISOString(),
      actor: { name: null, role: 'admin' },
    });
  }

  if (row.video_submitted_at) {
    events.push({
      id: `${row.id}:link`,
      type: 'link_submitted',
      at: row.video_submitted_at.toISOString(),
      actor: { name: creatorName, role: 'creator' },
      payload: { link: row.video_link ?? '' },
    });
  }

  return events.sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id),
  );
}

export function toContentDetail(row: ContentDetailRow, today: string): ContentDetail {
  const deadlineDay = row.deadline.toISOString().slice(0, 10);
  const latest = [...row.submissions].sort(
    (a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id.localeCompare(a.id),
  )[0];

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    brief: row.brief,
    deadline: deadlineDay,
    status: row.status,
    creatorName: joinName(row.contracts.creators),
    tags: {
      overdue: isOverdue(row.status, deadlineDay, today),
      // Written at submit time by PBI 6.2; until those columns exist nothing can claim them.
      lateSubmission: false,
      approvalBypassed: false,
    },
    waitingOn: waitingOnFor(row.status),
    latestSubmissionId: latest?.id ?? null,
    creatorActions: taskActions(row.status, deadlineDay, today),
    events: buildEvents(row),
  };
}
