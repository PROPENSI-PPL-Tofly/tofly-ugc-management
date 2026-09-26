// Decisions on a draft from the review queue (PRD 3.11): approve sends the draft on to the
// creator, revise sends it back with a note. Fetched in the browser through this app's /api
// proxy, like fetchDraftPreview, so BACKEND_URL never reaches the browser.

/** A failed decision, keeping the HTTP status so 404 and 409 can read differently. */
export class DraftReviewActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DraftReviewActionError";
  }
}

/** What the backend answers an error with: sometimes a flat message, sometimes field errors. */
interface FailureBody {
  message?: string;
  errors?: Record<string, string>;
}

async function readMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as FailureBody;
    const fieldErrors = body.errors ? Object.values(body.errors) : [];
    return fieldErrors.find(Boolean) ?? body.message ?? null;
  } catch {
    return null;
  }
}

async function patch(
  path: string,
  fallbackMessage: string,
  body?: { revisionNotes: string },
): Promise<void> {
  const response = await fetch(`/api/submissions/${path}`, {
    method: "PATCH",
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });

  if (!response.ok) {
    // Only a 4xx carries a message written for the admin; a 5xx body is the server's or a
    // gateway's own wording and may describe internals, so it is never shown.
    const message = response.status < 500 ? await readMessage(response) : null;
    throw new DraftReviewActionError(response.status, message ?? fallbackMessage);
  }
}

/**
 * Approves the draft: its content becomes Draft Approved and it leaves the queue.
 * The id is encoded so a crafted value cannot climb out of /submissions/ (OWASP A01).
 */
export async function approveSubmission(submissionId: string): Promise<void> {
  return patch(
    `${encodeURIComponent(submissionId)}/approve`,
    "Keputusan gagal dikirim. Coba lagi.",
  );
}

/** Sends the draft back to the creator with a revision note. */
export async function reviseSubmission(
  submissionId: string,
  revisionNotes: string,
): Promise<void> {
  return patch(
    `${encodeURIComponent(submissionId)}/revise`,
    "Permintaan revisi gagal dikirim. Coba lagi.",
    { revisionNotes },
  );
}
