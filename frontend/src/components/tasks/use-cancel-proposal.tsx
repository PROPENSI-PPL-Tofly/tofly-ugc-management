"use client";

import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cancelProposal } from "@/lib/cancel-proposal";

/** The proposal being withdrawn, as a row or the panel knows it. */
export interface ProposalToCancel {
  id: string;
  name: string;
}

/**
 * "Batalkan Pengajuan" (PBI-14, 14.3), shared by Task Saya's rows and the Content Detail panel:
 * one confirmation in the prototype's words, then the request. What happens after belongs to the
 * host, which outlives the row and the panel (the toast and the list read again).
 */
export function useCancelProposal({
  onCancelled,
  onFailed,
}: {
  onCancelled: (proposal: ProposalToCancel) => void;
  /** `stale`: the admin decided or it is gone, so the list on screen is out of date. */
  onFailed: (message: string, stale: boolean) => void;
}): {
  ask: (proposal: ProposalToCancel) => void;
  /** Whether this proposal's withdrawal is on its way, so its button waits for the answer. */
  isWithdrawing: (id: string) => boolean;
  dialog: ReactNode;
} {
  const [asking, setAsking] = useState<ProposalToCancel | null>(null);
  // The dialog closes before the answer comes back; a proposal on its way is not asked about
  // again, so one press never sends a second DELETE (review on #270).
  const [withdrawing, setWithdrawing] = useState<ReadonlySet<string>>(new Set());

  function ask(proposal: ProposalToCancel) {
    if (!withdrawing.has(proposal.id)) setAsking(proposal);
  }

  function settle(id: string) {
    setWithdrawing((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function withdraw(proposal: ProposalToCancel) {
    setAsking(null);
    setWithdrawing((current) => new Set(current).add(proposal.id));
    const result = await cancelProposal(proposal.id);
    settle(proposal.id);
    if (result.ok) onCancelled(proposal);
    else onFailed(result.message, result.stale);
  }

  const dialog = asking ? (
    <ConfirmDialog
      title="Batalkan Pengajuan?"
      message={`"${asking.name}" akan dihapus dari daftar.`}
      confirmLabel="Batalkan Pengajuan"
      cancelLabel="Kembali"
      onConfirm={() => void withdraw(asking)}
      onCancel={() => setAsking(null)}
    />
  ) : null;

  return { ask, isWithdrawing: (id) => withdrawing.has(id), dialog };
}
