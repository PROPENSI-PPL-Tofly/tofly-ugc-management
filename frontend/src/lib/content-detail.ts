// Everything the Content Detail panel knows about GET /api/contents/:id (admin) and
// GET /me/contents/:id (creator): the shape the API answers with, the shape the panel
// renders, and the one function that turns the first into the second.
//
// The endpoint's event order is the contract: newest first, and this module never
// re-sorts it, so the panel and the API can never disagree about the journey.

import { apiFetch } from "./api-client";
import type { ContentType } from "./contents";
import type { ContentStatus, ContentTag } from "./creators";
import type { Role } from "./session";
import { METRICS, formatMetric, type MetricName } from "./link-performance";
import type { MyTaskAction } from "./my-tasks";
import { PLATFORM_LABELS, linkEventTitle, type ContentLink, type Platform } from "./platform-links";
import type { EditWindow } from "./content-edit";
import { formatDate } from "./format";

export type DetailEventType =
  | "scheduled"
  | "proposal_approved"
  | "auto_scheduled"
  | "creator_comment"
  | "draft_submitted"
  | "revision_requested"
  | "draft_approved"
  | "link_submitted"
  | "performance_entered"
  | "performance_replaced"
  | "content_updated"
  | "revision_followup_added";

/** One number a performance step moved (PBI-27 AC 16, 17). */
export interface MetricChangeRow {
  metric: MetricName;
  before: number | null;
  after: number | null;
}

/** One edited field's value before and after (PBI-25 AC 4). */
export interface FieldChange {
  from: string;
  to: string;
}

export type ContentChanges = Partial<Record<"deadline" | "brief" | "name", FieldChange>>;

/** A screenshot attached to a revision note (PBI-34); `url` is what the browser opens it through. */
export interface NoteImage {
  id: string;
  url: string;
  contentType: string;
}

/** A note the admin added under a revision note already sent, while that round was open. */
export interface FollowUp {
  id: string;
  note: string;
  /** The follow-up's sanitized formatting (PBI-34's editor); absent for a plain one. */
  noteHtml?: string;
  /** The screenshots it went out with (PBI-34); absent when it has none. */
  images?: NoteImage[];
  /** ISO instant the follow-up was saved. */
  at: string;
  actor: { name: string | null };
}

/** One step of the journey as the API sends it. */
export interface RawContentEvent {
  id: string;
  type: DetailEventType;
  /** ISO instant, or a plain day when the API only knows the day; the newest arrives first. */
  at: string;
  /** "system" for a step the app took by itself (the H-1 scheduling); it has no name. */
  actor: { name: string | null; role: "admin" | "creator" | "system" };
  payload?: {
    version?: number;
    link?: string;
    note?: string;
    /** The note as sanitized rich text (PBI-34 AC 8); absent for a note from before it (AC 9). */
    noteHtml?: string;
    /** The note's screenshots (PBI-34 AC 8); absent when it has none. */
    images?: NoteImage[];
    platform?: Platform;
    /** A link that took the place of another (38.2); the step stays a link step. */
    replaced?: boolean;
    /**
     * What the step changed: the numbers a performance step moved (PBI-27 AC 16, 17), or each
     * field an admin's edit changed (PBI-25 AC 4, on content_updated).
     */
    changes?: MetricChangeRow[] | ContentChanges;
    /** On a revision request: the follow-ups added under its note, oldest first. */
    followUps?: FollowUp[];
  };
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
  /** Late, overdue or approval bypassed, in the backend's order; empty when nothing is flagged. */
  tags: ContentTag[];
  waitingOn: "admin" | "creator" | null;
  latestSubmissionId: string | null;
  creatorActions: MyTaskAction[];
  events: RawContentEvent[];
  /** The submitted links, one per platform (AC 11); absent in an answer that predates 38.1. */
  links?: ContentLink[];
  /**
   * The days an admin may move the deadline to, sent only while Ubah and Hapus apply (PBI-25
   * AC 1, 3, 9); null otherwise and on a creator's read, absent in an answer from before 25.2.
   */
  edit?: EditWindow | null;
}

export type ContentDetail = RawContentDetail;

/** A failed answer from the API, keeping the status so a 404 can read differently. */
export class ContentDetailError extends Error {
  constructor(readonly status: number) {
    super(`Loading the content detail failed with HTTP ${status}`);
    this.name = "ContentDetailError";
  }
}

/**
 * Adapter pattern: the one place the API's answer becomes what the panel reads. It is a
 * pass-through today; it exists so the panel never sees the wire shape, and a change to the
 * endpoint is a change here and nowhere in the UI.
 */
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
  /** What the step changed, one line each ("Views: 100 → 12.400", "Deadline 20 Nov 2026 → 25 Nov 2026"); empty when nothing did. */
  changes: string[];
}

// How each kind of event reads. The number is the draft's version or the revision round;
// kinds that have neither ignore it. A kind without a link label never shows a link.
//
// Open/Closed Principle: one entry per kind in a table, not a switch inside describeJourney.
// A new kind of event is a new entry here (the Record type refuses to compile without it),
// and the function that walks the events stays as it is.
const STEP_WORDING: Record<
  DetailEventType,
  (ordinal: number, by: RawContentEvent["actor"]["role"], event: RawContentEvent) => {
    title: string;
    linkLabel: string | null;
  }
> = {
  // A content starts with whoever made it: an admin adds it, a creator proposes it.
  scheduled: (_ordinal, by) => ({
    title: by === "creator" ? "Diajukan kreator" : "Ditambahkan Admin",
    linkLabel: null,
  }),
  draft_submitted: (version) => ({
    title: `Draft v${version} dikirim`,
    linkLabel: `Buka draft v${version}`,
  }),
  revision_requested: (round) => ({ title: `Revisi ke-${round} diminta`, linkLabel: null }),
  draft_approved: () => ({ title: "Draft di-approve", linkLabel: null }),
  proposal_approved: () => ({ title: "Pengajuan disetujui", linkLabel: null }),
  auto_scheduled: () => ({ title: "Dijadwalkan otomatis (H-1)", linkLabel: null }),
  // A comment moves the content nowhere; its note is the whole point and reads signed.
  creator_comment: () => ({ title: "Komentar kreator", linkLabel: null }),
  performance_entered: (_ordinal, _by, event) => ({
    title: `Angka ${event.payload?.platform ? PLATFORM_LABELS[event.payload.platform] : "performa"} diisi manual`,
    linkLabel: null,
  }),
  performance_replaced: (_ordinal, _by, event) => ({
    title: `Angka manual diganti data ${event.payload?.platform ? PLATFORM_LABELS[event.payload.platform] : "platform"}`,
    linkLabel: null,
  }),
  link_submitted: (_ordinal, _by, event) => ({
    title: linkEventTitle(event.payload?.platform, event.payload?.replaced === true),
    linkLabel: "Buka video",
  }),
  // An admin's edit of scheduled content (PBI-25 AC 4); what changed is listed under it.
  content_updated: () => ({ title: "Konten diubah", linkLabel: null }),
  // The follow-up itself reads under the note it adds to; this step only marks when.
  revision_followup_added: () => ({ title: "Catatan susulan ditambahkan", linkLabel: null }),
};

/** The lines under an edit: the old and new deadline and name, and that the brief changed. */
function editLines(changes: ContentChanges | undefined): string[] {
  const lines: string[] = [];
  if (changes?.deadline) {
    lines.push(`Deadline ${formatDate(changes.deadline.from)} → ${formatDate(changes.deadline.to)}`);
  }
  if (changes?.name) lines.push(`Nama ${changes.name.from} → ${changes.name.to}`);
  if (changes?.brief) lines.push("Brief diubah");
  return lines;
}

function noteSignature(event: RawContentEvent): string | null {
  if (!event.payload?.note?.trim()) {
    return null;
  }
  if (event.actor.role === "admin") {
    // The admin's email when the API names one; the role alone when no account is behind it.
    return `Catatan ${event.actor.name ?? "Admin"}`;
  }
  return `Catatan ${event.actor.name ?? "kreator"}`;
}

/**
 * Words each event of the journey without touching its order. Draft versions come from the
 * API; when it sends none they are counted from the oldest event up, as revision rounds
 * always are, so the numbers stay right whichever way the list is shown.
 */
// An edit carries its fields by name; a number step carries the metrics that moved, as a list.
function changeLines(event: RawContentEvent): string[] {
  const changes = event.payload?.changes;
  if (event.type === "content_updated") {
    return Array.isArray(changes) ? [] : editLines(changes);
  }
  return (Array.isArray(changes) ? changes : []).map(({ metric, before, after }) => {
    const label = METRICS.find(({ name }) => name === metric)?.label;
    return `${label}: ${formatMetric(before)} → ${formatMetric(after)}`;
  });
}

export function describeJourney(events: RawContentEvent[]): JourneyStep[] {
  const steps: JourneyStep[] = [];
  let drafts = 0;
  let rounds = 0;

  // The endpoint sends newest first, so the count walks the list backwards.
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    // A follow-up reads under the revision note it adds to (PBI-33 AC 4), so it takes no step.
    if (event.type === "revision_followup_added") continue;
    let ordinal = 0;

    if (event.type === "draft_submitted") {
      drafts += 1;
      ordinal = event.payload?.version ?? drafts;
    } else if (event.type === "revision_requested") {
      rounds += 1;
      ordinal = rounds;
    }

    // A kind newer than this build (the backend deploys first) is left out rather than guessed
    // at, as the backend skips a stored kind it does not know.
    const wording = STEP_WORDING[event.type] as (typeof STEP_WORDING)[DetailEventType] | undefined;
    if (!wording) continue;
    const { title, linkLabel } = wording(ordinal, event.actor.role, event);

    steps.unshift({
      event,
      title,
      linkLabel: event.payload?.link ? linkLabel : null,
      noteBy: noteSignature(event),
      changes: changeLines(event),
    });
  }

  return steps;
}

/**
 * The revision request whose note follow-ups go under: the newest one, which in the
 * endpoint's newest-first order is the first. Null when no revision was ever asked for.
 */
export function latestRevisionEventId(events: readonly RawContentEvent[]): string | null {
  return events.find((event) => event.type === "revision_requested")?.id ?? null;
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
