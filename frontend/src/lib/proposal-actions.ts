// An admin's decision on a creator's proposal (PRD 3.10), from the Content Detail panel:
// approving turns it into scheduled work, rejecting discards it with an optional reason that
// goes to the creator. Through this app's /api proxy, like the draft decisions.

import { sendDecision } from "./decisions";

/** The proposal becomes a normal Scheduled content. The id is encoded (OWASP A01). */
export async function approveProposal(contentId: string): Promise<void> {
  return sendDecision(
    `/api/contents/${encodeURIComponent(contentId)}/proposal/approve`,
    "PATCH",
    "Pengajuan gagal disetujui. Coba lagi.",
  );
}

/** Removes the proposal for good; a blank reason is sent as none, since it is optional. */
export async function rejectProposal(contentId: string, reason: string): Promise<void> {
  const written = reason.trim();
  return sendDecision(
    `/api/contents/${encodeURIComponent(contentId)}/proposal/reject`,
    "POST",
    "Pengajuan gagal ditolak. Coba lagi.",
    { reason: written === "" ? null : written },
  );
}
