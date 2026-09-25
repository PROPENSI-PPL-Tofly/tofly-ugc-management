// Everything the Draft Preview modal knows about GET /api/submissions/:id: the shape the API
// answers with, the shape the modal renders, and the one function that turns the first into
// the second.
//
// The response shape is an assumption until SCRUM-123 settles it. Keeping it behind
// toDraftPreview means a contract change is a change in this file, not in the modal.

import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";

/** One submission as the API sends it, oldest or newest first, unordered. */
export interface RawDraftRevision {
  submissionId: string;
  link: string;
  /** Admin's "Minta Revisi" note on this draft; null while it has not been revised. */
  note: string | null;
  /** submissions.created_at, a full ISO timestamp. */
  submittedAt: string;
}

export interface RawDraftPreview {
  submissionId: string;
  contentName: string;
  creatorName: string;
  type: ContentType;
  brief: string | null;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  draftLink: string;
  revisions: RawDraftRevision[];
}

export interface DraftRevision extends RawDraftRevision {
  /** True for the draft this preview was opened on, the one waiting for a decision. */
  isCurrent: boolean;
}

export interface DraftPreview extends Omit<RawDraftPreview, "brief" | "revisions"> {
  brief: string;
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

/** A note of nothing but whitespace says nothing, so it reads as no note at all. */
function readNote(note: string | null): string | null {
  return note?.trim() ? note : null;
}

export function toDraftPreview(raw: RawDraftPreview): DraftPreview {
  const revisions = raw.revisions
    .toSorted((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))
    .map((revision) => ({
      ...revision,
      note: readNote(revision.note),
      isCurrent: revision.submissionId === raw.submissionId,
    }));

  return { ...raw, brief: raw.brief ?? "", revisions };
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

  return toDraftPreview((await response.json()) as RawDraftPreview);
}
