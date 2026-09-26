// Everything the Draft Preview modal knows about GET /api/submissions/:id: the shape the API
// answers with, the shape the modal renders, and the one function that turns the first into
// the second.
//
// The response carries brief, link, status and the revision history, plus the header fields
// (contentName, creatorName, deadline, type). Those stay optional here so a response without
// them still renders, with a dash in place of each missing value.

import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";

/** One "Minta Revisi" as the API sends it. */
export interface RawRevision {
  note: string | null;
  /** When the note was written (submissions.updated_at), a full ISO timestamp. */
  date: string;
}

export interface RawDraftPreview {
  brief: string | null;
  /** The draft file of the submission asked for. */
  link: string;
  status: ContentStatus;
  revisionHistory: RawRevision[];
  contentName?: string | null;
  creatorName?: string | null;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline?: string | null;
  type?: ContentType | null;
}

export interface DraftRevision {
  note: string;
  date: string;
}

export interface DraftPreview {
  submissionId: string;
  contentName: string | null;
  creatorName: string | null;
  type: ContentType | null;
  brief: string;
  deadline: string | null;
  status: ContentStatus;
  draftLink: string;
  /** Oldest first, so the history reads in the order it happened. */
  revisions: DraftRevision[];
}

/** A failed answer from the API, keeping the status so a 404 can read differently from a 500. */
export class DraftPreviewError extends Error {
  constructor(readonly status: number) {
    super(`Loading draft preview failed with HTTP ${status}`);
    this.name = "DraftPreviewError";
  }
}

/** The history is of notes: an entry whose note says nothing has nothing to show. */
function hasNote(revision: RawRevision): revision is DraftRevision {
  return Boolean(revision.note?.trim());
}

export function toDraftPreview(raw: RawDraftPreview, submissionId: string): DraftPreview {
  const revisions = raw.revisionHistory
    .filter(hasNote)
    .toSorted((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .map(({ note, date }) => ({ note, date }));

  return {
    submissionId,
    contentName: raw.contentName ?? null,
    creatorName: raw.creatorName ?? null,
    type: raw.type ?? null,
    brief: raw.brief ?? "",
    deadline: raw.deadline ?? null,
    status: raw.status,
    draftLink: raw.link,
    revisions,
  };
}

/**
 * Fetched in the browser through this app's /api proxy, like the creator detail, which keeps
 * BACKEND_URL out of the browser. The id is encoded so a crafted value cannot climb out of
 * /submissions/ into another endpoint (OWASP A01).
 */
export async function fetchDraftPreview(submissionId: string): Promise<DraftPreview> {
  const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new DraftPreviewError(response.status);
  }

  return toDraftPreview((await response.json()) as RawDraftPreview, submissionId);
}
