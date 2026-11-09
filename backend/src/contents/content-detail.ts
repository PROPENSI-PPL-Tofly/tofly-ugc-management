import type { content_status, social_platform } from '@prisma/client';
import { jakartaDay, joinName } from '../creators/evergreen.js';
import { taskActions, type TaskAction } from '../me/task-actions.js';
import { firstLink } from './content-links.js';
import { contentTags, type ContentTag } from './content-tags.js';
import type { LinkPerformance } from '../performance/link-performance.js';
import {
  performanceOf,
  type AccountConnection,
  type StoredLinkPerformance,
} from '../performance/performance-links.js';
import { noteImageOf, type NoteImage, type StoredNoteImage } from '../submissions/note-image.js';
import { fromStoredHistory, type StoredEventRow } from './stored-history.js';
import { editWindow, type EditWindow } from './content-edit.js';
import type { InvoiceLifecycleStatus } from '../invoices/invoice-lifecycle.js';

// The facts one content item's detail panel needs, assembled without a database: the side the
// step is waiting on and the journey so far. The tags the prototype draws beside the status
// are not decided here: they come from content-tags.ts, the same rules every other read uses.
//
// The journey is the stored history (content_events, read by stored-history.ts). buildEvents
// derives it from contents + submissions only for a content nothing was recorded for; that
// derivation cannot recover an approval a later status change overwrote, so it never claims one
// for a link_submitted content.

export type DetailWaitingOn = 'admin' | 'creator' | null;

/** One number a performance step moved; null is a number that was empty. */
export interface MetricChange {
  metric: 'views' | 'likes' | 'comments' | 'shares';
  before: number | null;
  after: number | null;
}

export type DetailEventType =
  | 'scheduled'
  | 'proposal_approved'
  | 'auto_scheduled'
  | 'creator_comment'
  | 'draft_submitted'
  | 'revision_requested'
  | 'draft_approved'
  | 'link_submitted'
  | 'performance_entered'
  | 'performance_replaced'
  | 'content_updated'
  | 'revision_followup_added';

// A follow-up an admin added under a revision note already sent (PBI-33), named by role only.
export interface DetailFollowUp {
  id: string;
  note: string;
  /** The follow-up's sanitized formatting, when it was written with any. */
  noteHtml?: string;
  // ISO instant the follow-up was saved.
  at: string;
  actor: { name: string };
}

export interface DetailSubmissionRow {
  id: string;
  link: string;
  created_at: Date;
  updated_at: Date;
  revision_notes: string | null;
  /** The same note as sanitized rich text (PBI-34); null for a note from before it (AC 9). */
  revision_notes_html: string | null;
  /** The screenshots attached to the note (PBI-34, AC 8), first attached first. */
  revision_note_images: StoredNoteImage[];
  /** What the creator wrote to the admin with this hand-in, if anything. */
  creator_notes: string | null;
}

/** One stored link (PBI-38), in the order the read sorts them: first handed in first. */
export interface DetailLinkRow extends StoredLinkPerformance {
  submitted_at: Date;
}

export interface ContentDetailRow {
  id: string;
  name: string;
  type: 'evergreen' | 'specific';
  brief: string;
  deadline: Date;
  status: content_status;
  content_links: DetailLinkRow[];
  video_submitted_at: Date | null;
  approval_bypassed: boolean;
  created_at: Date;
  updated_at: Date;
  contracts: {
    start_date: Date;
    end_date: Date;
    invoice: { status: InvoiceLifecycleStatus } | null;
    creators: {
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
      social_accounts: AccountConnection[];
    };
  };
  submissions: DetailSubmissionRow[];
  /** The stored history, newest first; empty for a content nothing was recorded for. */
  content_events: StoredEventRow[];
}

export interface ContentEvent {
  id: string;
  type: DetailEventType;
  /**
   * ISO instant, or a plain ISO day ("2026-09-15") when only the day was stored. The response
   * lists the newest event first.
   */
  at: string;
  /** A system step has no name: the app did it by itself. */
  actor: { name: string | null; role: 'admin' | 'creator' | 'system' };
  /**
   * `platform` names a link step's platform (PBI-38 AC 12); `replaced` marks a link that took
   * another's place, so the step still reads as a link to a panel that knows no other kind.
   */
  payload?: {
    version?: number;
    link?: string;
    note?: string;
    /** The note as sanitized rich text (PBI-34 AC 8); absent for a plain or legacy note (AC 9). */
    noteHtml?: string;
    /** The note's screenshots (PBI-34 AC 8); absent when the note has none. */
    images?: NoteImage[];
    platform?: social_platform;
    replaced?: true;
    /**
     * What the step changed: the numbers a performance step moved (PBI-27 AC 16, 17), or each
     * field an admin's edit changed, old and new (PBI-25 AC 4, on content_updated).
     */
    changes?: MetricChange[] | ContentChanges;
    // On a revision request: the follow-ups added under its note, oldest first (PBI-33 AC 4).
    followUps?: DetailFollowUp[];
  };
}

/** One edited field's value before and after. */
export interface FieldChange {
  from: string;
  to: string;
}

export type ContentChanges = Partial<
  Record<'deadline' | 'brief' | 'name', FieldChange>
>;

/** One of the content's video links, as the panel lists them (PBI-38 AC 11). */
export interface ContentLink {
  platform: social_platform | null;
  url: string;
  /** ISO calendar day. */
  submittedAt: string;
  /** Its numbers and state (PBI-27); null for a link with no platform to be measured on. */
  performance: Omit<LinkPerformance, 'platform' | 'url'> | null;
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
  /** Overdue or approval bypassed, in that order; empty when nothing needs attention. */
  tags: ContentTag[];
  waitingOn: DetailWaitingOn;
  latestSubmissionId: string | null;
  creatorActions: TaskAction[];
  /** Every link handed in, first first; empty before the first. */
  links: ContentLink[];
  events: ContentEvent[];
  /**
   * The days an admin may move the deadline to while Ubah and Hapus are offered (PBI-25 AC 1,
   * 3, 9); null when the content may no longer change, and always null on a creator's read.
   */
  edit: EditWindow | null;
}

/** An admin's read: the global buffer the earliest-deadline rule counts with. */
export interface AdminView {
  bufferDays: number;
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

/** A note that says nothing is no note: blank and whitespace-only are left out. */
function said(note: string | null): note is string {
  return Boolean(note?.trim());
}

/**
 * The journey, newest first. Submissions arrive oldest-first from the query, so versions
 * count up along the way and the sort at the end flips the list for the panel. The link is
 * kept out of that sort: it closes the content, so it is always the newest event, and its
 * stored day has no hour to sort by.
 */
export function buildEvents(
  row: Pick<
    ContentDetailRow,
    | 'id'
    | 'status'
    | 'created_at'
    | 'updated_at'
    | 'content_links'
    | 'video_submitted_at'
    | 'contracts'
    | 'submissions'
  >,
): ContentEvent[] {
  const creatorName = joinName(row.contracts.creators);
  const events: ContentEvent[] = [
    {
      id: `${row.id}:scheduled`,
      type: 'scheduled',
      at: row.created_at.toISOString(),
      // Only a creator's own proposal is ever pending; an admin's content starts scheduled.
      actor:
        row.status === 'pending'
          ? { name: creatorName, role: 'creator' }
          : { name: null, role: 'admin' },
    },
  ];

  const ordered = [...row.submissions].sort(
    (a, b) =>
      a.created_at.getTime() - b.created_at.getTime() ||
      a.id.localeCompare(b.id),
  );

  ordered.forEach((submission, index) => {
    events.push({
      id: submission.id,
      type: 'draft_submitted',
      at: submission.created_at.toISOString(),
      actor: { name: creatorName, role: 'creator' },
      payload: {
        version: index + 1,
        link: submission.link,
        ...(said(submission.creator_notes) && {
          note: submission.creator_notes,
        }),
      },
    });

    if (said(submission.revision_notes)) {
      const images = submission.revision_note_images.map(noteImageOf);
      events.push({
        id: `${submission.id}:revision`,
        type: 'revision_requested',
        at: submission.updated_at.toISOString(),
        actor: { name: null, role: 'admin' },
        payload: {
          note: submission.revision_notes,
          // A note from before rich text carries no HTML and no screenshots, and so reads
          // exactly as it always did (AC 9).
          ...(said(submission.revision_notes_html) && {
            noteHtml: submission.revision_notes_html,
          }),
          ...(images.length > 0 && { images }),
        },
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

  events.sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id),
  );

  if (row.video_submitted_at) {
    events.unshift({
      id: `${row.id}:link`,
      type: 'link_submitted',
      // A Postgres `date`: its day is all that was stored, so its day is all that is sent.
      at: row.video_submitted_at.toISOString().slice(0, 10),
      actor: { name: creatorName, role: 'creator' },
      // The first link is the one that set the submitted day.
      payload: { link: firstLink(row.content_links)?.url ?? '' },
    });
  }

  return events;
}

/** A link's numbers and state without the platform and url the link already carries. */
function measuredOf(
  link: DetailLinkRow,
  accounts: readonly AccountConnection[],
): ContentLink['performance'] {
  if (link.platform === null) return null;
  const {
    platform: _platform,
    url: _url,
    ...measured
  } = performanceOf(link, accounts);
  return measured;
}

export function toContentDetail(
  row: ContentDetailRow,
  now: Date,
  admin?: AdminView,
): ContentDetail {
  const today = jakartaDay(now);
  const deadlineDay = row.deadline.toISOString().slice(0, 10);
  const latest = [...row.submissions].sort(
    (a, b) =>
      b.created_at.getTime() - a.created_at.getTime() ||
      b.id.localeCompare(a.id),
  )[0];

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    brief: row.brief,
    deadline: deadlineDay,
    status: row.status,
    creatorName: joinName(row.contracts.creators),
    tags: contentTags(
      {
        deadline: row.deadline,
        status: row.status,
        videoSubmittedAt: row.video_submitted_at,
        approvalBypassed: row.approval_bypassed,
      },
      now,
    ),
    waitingOn: waitingOnFor(row.status),
    latestSubmissionId: latest?.id ?? null,
    creatorActions: taskActions(row.status, deadlineDay, today),
    links: row.content_links.map((link) => ({
      platform: link.platform,
      url: link.url,
      submittedAt: link.submitted_at.toISOString().slice(0, 10),
      performance: measuredOf(link, row.contracts.creators.social_accounts),
    })),
    // The stored history is the record; a content with none falls back to what its rows prove.
    events:
      row.content_events.length > 0
        ? fromStoredHistory(row.content_events)
        : buildEvents(row),
    edit: admin
      ? editWindow(
          {
            status: row.status,
            drafts: row.submissions.length,
            contractStart: row.contracts.start_date.toISOString().slice(0, 10),
            contractEnd: row.contracts.end_date.toISOString().slice(0, 10),
            invoiceStatus: row.contracts.invoice?.status ?? null,
          },
          { today, bufferDays: admin.bufferDays },
        )
      : null,
  };
}
