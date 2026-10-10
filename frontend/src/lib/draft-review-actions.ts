// Decisions on a draft from the review queue (PRD 3.11): approve sends the draft on to the
// creator, revise sends it back with a note. Fetched in the browser through this app's /api
// proxy, like fetchDraftPreview, so BACKEND_URL never reaches the browser.

import { sendDecision } from "./decisions";

/**
 * Approves the draft: its content becomes Draft Approved and it leaves the queue.
 * The id is encoded so a crafted value cannot climb out of /submissions/ (OWASP A01).
 */
export async function approveSubmission(submissionId: string): Promise<void> {
  return sendDecision(
    `/api/submissions/${encodeURIComponent(submissionId)}/approve`,
    "PATCH",
    "Keputusan gagal dikirim. Coba lagi.",
  );
}

/** Sends the draft back to the creator with a revision note. */
export async function reviseSubmission(
  submissionId: string,
  revisionNotes: string,
): Promise<void> {
  return sendDecision(
    `/api/submissions/${encodeURIComponent(submissionId)}/revise`,
    "PATCH",
    "Permintaan revisi gagal dikirim. Coba lagi.",
    { revisionNotes },
  );
}
