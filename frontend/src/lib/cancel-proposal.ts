// "Batalkan Pengajuan" from Task Saya (PBI-14, 14.3): the creator withdraws a proposal the admin
// has not decided yet. Through this app's same-origin /api proxy, like every hand-in. The route is
// 14.1's DELETE /me/contents/proposals/:id; until 14.1 is merged its contract is assumed here.

import { apiFetch } from "./api-client";
import { isUuid } from "./creator-detail";

/**
 * Done, or why not. `stale` says the list on screen no longer matches the server (the admin
 * decided, or the proposal is gone), so the page should be read again.
 */
export type CancelProposalResult = { ok: true } | { ok: false; stale: boolean; message: string };

const FAILED: CancelProposalResult = {
  ok: false,
  stale: false,
  message: "Pengajuan gagal dibatalkan. Coba lagi.",
};

/** The server's own text is never shown: only these words reach the creator (OWASP A10). */
const STALE_MESSAGES: Partial<Record<number, string>> = {
  404: "Pengajuan tidak ditemukan. Muat ulang untuk melihat status terbaru.",
  409: "Pengajuan sudah diputuskan Admin. Muat ulang untuk melihat status terbaru.",
};

/** Withdraws the creator's own pending proposal. A malformed id never reaches the network (OWASP A01). */
export async function cancelProposal(contentId: string): Promise<CancelProposalResult> {
  if (!isUuid(contentId)) return FAILED;

  let response: Response;
  try {
    response = await apiFetch(`/api/me/contents/proposals/${contentId}`, { method: "DELETE" });
  } catch {
    return FAILED;
  }

  if (response.ok) return { ok: true };
  const stale = STALE_MESSAGES[response.status];
  return stale ? { ok: false, stale: true, message: stale } : FAILED;
}
