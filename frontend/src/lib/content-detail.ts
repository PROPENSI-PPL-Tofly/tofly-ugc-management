// Everything the Content Detail panel knows about GET /api/contents/:id/timeline: the shape the
// API answers with, the shape the panel renders, and the one function that turns the first
// into the second.
//
// The endpoint is subtask 6.3 and is not built yet, so the raw shape here is an assumption: the
// content's header fields plus its events, each with a type, an actor, a timestamp and what it
// carries. When the real contract lands, it changes here and nowhere else.

import { apiFetch } from "./api-client";
import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";

export const TIMELINE_EVENT_TYPES = [
  "scheduled",
  "draft_submitted",
  "revision_requested",
  "draft_approved",
  "link_submitted",
  "creator_comment",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];
export type ActorRole = "admin" | "creator";

/** One event as the API sends it. */
export interface RawTimelineEvent {
  type: string;
  actor: { name: string; role: ActorRole };
  /** When it happened, a full ISO timestamp. */
  timestamp: string;
  /** The draft's version number, on draft_submitted. */
  version?: number | null;
  /** The draft file or the final video, on draft_submitted and link_submitted. */
  link?: string | null;
  /** The revision note, the note sent along with a draft, or the creator's comment. */
  note?: string | null;
}

export interface RawContentDetail {
  content: {
    name: string;
    type: ContentType;
    status: ContentStatus;
    /** Plain calendar day, "YYYY-MM-DD". */
    deadline: string;
    brief: string | null;
    creatorName?: string | null;
    /** Which of the creator's contract periods the content belongs to, counted from 1. */
    periodNumber?: number | null;
  };
  events: RawTimelineEvent[];
}

/** One step of the timeline, already worded: the panel only lays it out. */
export interface TimelineEvent {
  type: TimelineEventType;
  /** "Draft v2 dikirim", "Revisi ke-1 diminta": the version or round is part of the title. */
  title: string;
  actorName: string;
  actorRole: ActorRole;
  timestamp: string;
  link: string | null;
  linkLabel: string | null;
  note: string | null;
  /** Whose note it is, as the line above the note reads. */
  noteBy: string | null;
}

/** The step the content is waiting on, shown above the history. */
export interface CurrentStep {
  waitingFor: ActorRole;
  title: string;
}

export interface ContentDetail {
  contentId: string;
  name: string;
  type: ContentType;
  status: ContentStatus;
  deadline: string;
  brief: string;
  creatorName: string | null;
  periodNumber: number | null;
  /** Null once nothing is left to do. */
  currentStep: CurrentStep | null;
  /** Newest first, so the latest step is the first thing read. */
  events: TimelineEvent[];
}

/** A failed answer from the API, keeping the status so a 404 can read differently from a 500. */
export class ContentDetailError extends Error {
  constructor(readonly status: number) {
    super(`Loading content detail failed with HTTP ${status}`);
    this.name = "ContentDetailError";
  }
}

// How each kind of event reads. The number is the draft's version or the revision round; kinds
// that have neither ignore it. A kind without a link label never shows a link.
const WORDING: Record<
  TimelineEventType,
  (ordinal: number) => { title: string; linkLabel: string | null }
> = {
  scheduled: () => ({ title: "Dijadwalkan", linkLabel: null }),
  draft_submitted: (version) => ({
    title: `Draft v${version} dikirim`,
    linkLabel: `Buka draft v${version}`,
  }),
  revision_requested: (round) => ({ title: `Revisi ke-${round} diminta`, linkLabel: null }),
  draft_approved: () => ({ title: "Draft di-approve", linkLabel: null }),
  link_submitted: () => ({ title: "Link video dikirim", linkLabel: "Buka video" }),
  creator_comment: () => ({ title: "Komentar kreator", linkLabel: null }),
};

function reviewStep(latestDraft: number): CurrentStep {
  return {
    waitingFor: "admin",
    title: latestDraft > 0 ? `Review draft v${latestDraft}` : "Review draft",
  };
}

// Who each status waits on and for what. One entry per status, so a status added to or removed
// from the lifecycle fails to compile here until it is given a step.
const STEPS: Record<ContentStatus, (latestDraft: number) => CurrentStep | null> = {
  scheduled: () => ({ waitingFor: "creator", title: "Kirim draft" }),
  draft_review: reviewStep,
  draft_revised: reviewStep,
  draft_revision: () => ({ waitingFor: "creator", title: "Kirim draft revisi" }),
  draft_approved: () => ({ waitingFor: "creator", title: "Kirim link video final" }),
  link_submitted: () => null,
};

function isTimelineEventType(type: string): type is TimelineEventType {
  return (TIMELINE_EVENT_TYPES as readonly string[]).includes(type);
}

/** A timestamp that cannot be read counts as the oldest, so the sort stays well defined. */
function moment(timestamp: string): number {
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? 0 : time;
}

function toTimelineEvent(
  raw: RawTimelineEvent,
  type: TimelineEventType,
  ordinal: number,
): TimelineEvent {
  const { title, linkLabel } = WORDING[type](ordinal);
  const link = linkLabel && raw.link ? raw.link : null;
  const note = raw.note?.trim() ? raw.note : null;
  const signature = raw.actor.role === "admin" ? "Catatan Admin" : `Catatan ${raw.actor.name}`;

  return {
    type,
    title,
    actorName: raw.actor.name,
    actorRole: raw.actor.role,
    timestamp: raw.timestamp,
    link,
    linkLabel: link ? linkLabel : null,
    note,
    noteBy: note ? signature : null,
  };
}

/**
 * Sorts the events and words each one. Versions and revision rounds are counted from the oldest
 * event up, then the list is handed back newest first. A type added to the API later has no
 * wording here yet, so it is left out, not shown blank.
 */
function toTimeline(raw: RawTimelineEvent[]): { events: TimelineEvent[]; latestDraft: number } {
  const oldestFirst = raw
    .toSorted((a, b) => moment(b.timestamp) - moment(a.timestamp))
    .toReversed();

  const events: TimelineEvent[] = [];
  let drafts = 0;
  let revisions = 0;
  let latestDraft = 0;

  for (const event of oldestFirst) {
    if (!isTimelineEventType(event.type)) continue;

    let ordinal = 0;
    if (event.type === "draft_submitted") {
      drafts += 1;
      ordinal = event.version ?? drafts;
      latestDraft = Math.max(latestDraft, ordinal);
    } else if (event.type === "revision_requested") {
      revisions += 1;
      ordinal = revisions;
    }

    events.push(toTimelineEvent(event, event.type, ordinal));
  }

  return { events: events.toReversed(), latestDraft };
}

export function toContentDetail(raw: RawContentDetail, contentId: string): ContentDetail {
  const { events, latestDraft } = toTimeline(raw.events);

  return {
    contentId,
    name: raw.content.name,
    type: raw.content.type,
    status: raw.content.status,
    deadline: raw.content.deadline,
    brief: raw.content.brief ?? "",
    creatorName: raw.content.creatorName ?? null,
    periodNumber: raw.content.periodNumber ?? null,
    // The API can name a status newer than this build: no step then, never a crash.
    currentStep: STEPS[raw.content.status]?.(latestDraft) ?? null,
    events,
  };
}

/**
 * Fetched in the browser through this app's /api proxy, like the draft preview, which keeps
 * BACKEND_URL out of the browser. The id is encoded so a crafted value cannot climb out of
 * /contents/ into another endpoint (OWASP A01).
 */
export async function fetchContentDetail(contentId: string): Promise<ContentDetail> {
  const response = await apiFetch(`/api/contents/${encodeURIComponent(contentId)}/timeline`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ContentDetailError(response.status);
  }

  return toContentDetail((await response.json()) as RawContentDetail, contentId);
}
