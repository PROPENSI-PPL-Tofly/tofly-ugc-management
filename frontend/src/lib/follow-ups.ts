// A follow-up note: something the admin adds under a revision note already sent, while the
// creator has not handed in the next draft yet. The original note is never changed; each
// follow-up is its own entry under it.

import { latestRevisionEventId, type ContentDetail, type FollowUp } from "./content-detail";
import { sendAndRead } from "./decisions";

/** The API's limit on a follow-up note, the same as on the revision note it adds to. */
export const MAX_FOLLOW_UP_LENGTH = 1000;

/**
 * Adds a follow-up to the open round of `submissionId` and answers with the saved entry, so
 * the panel can list it without reading the content again. A round the creator has already
 * answered with a new draft is refused with a 409 (DecisionError keeps the status). The id is
 * encoded so a crafted value cannot climb out of /submissions/ (OWASP A01).
 */
export async function addFollowUp(submissionId: string, note: string): Promise<FollowUp> {
  return sendAndRead<FollowUp>(
    `/api/submissions/${encodeURIComponent(submissionId)}/followups`,
    "POST",
    "Catatan susulan gagal dikirim. Coba lagi.",
    { note },
  );
}

/**
 * The detail with a just-saved follow-up added under the newest revision note, after the ones
 * already there: what the panel shows until it next reads the content. A new detail, so the
 * one it was given stays as it was; unchanged when no revision was ever asked for.
 */
export function withFollowUp(detail: ContentDetail, followUp: FollowUp): ContentDetail {
  const target = latestRevisionEventId(detail.events);
  if (target === null) return detail;

  return {
    ...detail,
    events: detail.events.map((event) =>
      event.id === target
        ? {
            ...event,
            payload: {
              ...event.payload,
              followUps: [...(event.payload?.followUps ?? []), followUp],
            },
          }
        : event,
    ),
  };
}
