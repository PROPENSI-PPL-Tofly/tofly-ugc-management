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
  /** The revision note or the creator's comment. */
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
  };
  events: RawTimelineEvent[];
}

export interface TimelineEvent {
  type: TimelineEventType;
  actorName: string;
  actorRole: ActorRole;
  timestamp: string;
  version: number | null;
  link: string | null;
  note: string | null;
}

/** One submitted draft, as the draft history lists it. */
export interface DraftVersion {
  version: number;
  link: string;
  submittedAt: string;
}

export interface ContentDetail {
  contentId: string;
  name: string;
  type: ContentType;
  status: ContentStatus;
  deadline: string;
  brief: string;
  /** Newest first, so the latest step is the first thing read. */
  events: TimelineEvent[];
  /** Newest version first. */
  drafts: DraftVersion[];
}

/** A failed answer from the API, keeping the status so a 404 can read differently from a 500. */
export class ContentDetailError extends Error {
  constructor(readonly status: number) {
    super(`Loading content detail failed with HTTP ${status}`);
    this.name = "ContentDetailError";
  }
}

function isTimelineEventType(type: string): type is TimelineEventType {
  return (TIMELINE_EVENT_TYPES as readonly string[]).includes(type);
}

/** A type added to the API later has no wording here yet, so it is left out, not shown blank. */
function toTimelineEvents(raw: RawTimelineEvent[]): TimelineEvent[] {
  return raw
    .toSorted((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .flatMap((event) =>
      isTimelineEventType(event.type)
        ? [
            {
              type: event.type,
              actorName: event.actor.name,
              actorRole: event.actor.role,
              timestamp: event.timestamp,
              version: event.version ?? null,
              link: event.link ?? null,
              note: event.note ?? null,
            },
          ]
        : [],
    );
}

/** The history is of drafts that can be labelled and opened: each needs its version and link. */
function toDraftVersions(events: TimelineEvent[]): DraftVersion[] {
  return events
    .flatMap(({ type, version, link, timestamp }) =>
      type === "draft_submitted" && version !== null && link
        ? [{ version, link, submittedAt: timestamp }]
        : [],
    )
    .toSorted((a, b) => b.version - a.version);
}

export function toContentDetail(raw: RawContentDetail, contentId: string): ContentDetail {
  const events = toTimelineEvents(raw.events);

  return {
    contentId,
    name: raw.content.name,
    type: raw.content.type,
    status: raw.content.status,
    deadline: raw.content.deadline,
    brief: raw.content.brief ?? "",
    events,
    drafts: toDraftVersions(events),
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
