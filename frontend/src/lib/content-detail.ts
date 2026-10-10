// Everything the Content Detail panel knows about GET /api/contents/:id (admin) and
// GET /me/contents/:id (creator): the shape the API answers with, the shape the panel
// renders, and the one function that turns the first into the second.
//
// The endpoint's event order is the contract: newest first, and this module never
// re-sorts it, so the panel and the API can never disagree about the journey.

import { apiFetch } from "./api-client";
import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";
import type { Role } from "./session";
import type { MyTaskAction } from "./my-tasks";

export type DetailEventType =
  | "scheduled"
  | "draft_submitted"
  | "revision_requested"
  | "draft_approved"
  | "link_submitted";

/** One step of the journey as the API sends it. */
export interface RawContentEvent {
  id: string;
  type: DetailEventType;
  /** ISO instant; the newest event arrives first. */
  at: string;
  actor: { name: string | null; role: "admin" | "creator" };
  payload?: { version?: number; link?: string; note?: string };
}

export interface RawContentDetail {
  id: string;
  name: string;
  type: ContentType;
  brief: string;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  creatorName: string;
  tags: { overdue: boolean; lateSubmission: boolean; approvalBypassed: boolean };
  waitingOn: "admin" | "creator" | null;
  latestSubmissionId: string | null;
  creatorActions: MyTaskAction[];
  events: RawContentEvent[];
}

export type ContentDetail = RawContentDetail;

/** A failed answer from the API, keeping the status so a 404 can read differently. */
export class ContentDetailError extends Error {
  constructor(readonly status: number) {
    super(`Loading the content detail failed with HTTP ${status}`);
    this.name = "ContentDetailError";
  }
}

/** The adapter is a pass-through today; it exists so the panel never sees the wire shape. */
export function toContentDetail(raw: RawContentDetail): ContentDetail {
  return raw;
}

/** One step of the journey, worded for the timeline: the panel only lays it out. */
export interface JourneyStep {
  event: RawContentEvent;
  /** "Draft v2 dikirim", "Revisi ke-1 diminta": the version or round is part of the title. */
  title: string;
  /** What the event's link opens; null when it has none to open. */
  linkLabel: string | null;
  /** Whose note it is, as the line above the note reads; null without a note. */
  noteBy: string | null;
}

// How each kind of event reads. The number is the draft's version or the revision round;
// kinds that have neither ignore it. A kind without a link label never shows a link.
const STEP_WORDING: Record<
  DetailEventType,
  (ordinal: number) => { title: string; linkLabel: string | null }
> = {
  scheduled: () => ({ title: "Ditambahkan Admin", linkLabel: null }),
  draft_submitted: (version) => ({
    title: `Draft v${version} dikirim`,
    linkLabel: `Buka draft v${version}`,
  }),
  revision_requested: (round) => ({ title: `Revisi ke-${round} diminta`, linkLabel: null }),
  draft_approved: () => ({ title: "Draft di-approve", linkLabel: null }),
  link_submitted: () => ({ title: "Link video dikirim", linkLabel: "Buka video" }),
};

function noteSignature(event: RawContentEvent): string | null {
  if (!event.payload?.note?.trim()) {
    return null;
  }
  if (event.actor.role === "admin") {
    return "Catatan Admin";
  }
  return `Catatan ${event.actor.name ?? "kreator"}`;
}

/**
 * Words each event of the journey without touching its order. Draft versions come from the
 * API; when it sends none they are counted from the oldest event up, as revision rounds
 * always are, so the numbers stay right whichever way the list is shown.
 */
export function describeJourney(events: RawContentEvent[]): JourneyStep[] {
  const steps: JourneyStep[] = [];
  let drafts = 0;
  let rounds = 0;

  // The endpoint sends newest first, so the count walks the list backwards.
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    let ordinal = 0;

    if (event.type === "draft_submitted") {
      drafts += 1;
      ordinal = event.payload?.version ?? drafts;
    } else if (event.type === "revision_requested") {
      rounds += 1;
      ordinal = rounds;
    }

    const { title, linkLabel } = STEP_WORDING[event.type](ordinal);

    steps.unshift({
      event,
      title,
      linkLabel: event.payload?.link ? linkLabel : null,
      noteBy: noteSignature(event),
    });
  }

  return steps;
}

/**
 * Where the panel's data comes from. Injected as a prop, so a touchpoint or a test can
 * swap the real HTTP loader for a stub without the panel knowing (Dependency Inversion).
 * The signal lets the panel cancel a request nobody is waiting for any more.
 */
export type ContentDetailLoader = (
  id: string,
  role: Role,
  signal?: AbortSignal,
) => Promise<ContentDetail>;

/**
 * Fetched in the browser through this app's /api proxy, which keeps BACKEND_URL out of
 * the browser. The id is encoded so a crafted value cannot climb out of /contents/ or
 * /me/contents/ into another endpoint (OWASP A01).
 */
export const fetchContentDetail: ContentDetailLoader = async (id, role, signal) => {
  const base = role === "admin" ? "/api/contents" : "/api/me/contents";
  const response = await apiFetch(`${base}/${encodeURIComponent(id)}`, {
    cache: "no-store",
    ...(signal && { signal }),
  });

  if (!response.ok) {
    throw new ContentDetailError(response.status);
  }

  return toContentDetail((await response.json()) as RawContentDetail);
};
