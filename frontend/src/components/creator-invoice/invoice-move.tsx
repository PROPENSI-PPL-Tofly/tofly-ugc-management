"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { CreatorInvoiceAction } from "@/lib/creator-invoice";
import {
  acknowledgeInvoice,
  confirmInvoicePayment,
  type CreatorMoveOutcome,
} from "@/lib/creator-invoice-actions.server";
import { useCreatorMove } from "./use-creator-move";

/** Each move in the prototype's words, and the server action that makes it. */
const MOVES: Record<
  CreatorInvoiceAction,
  {
    button: string;
    title: string;
    message: string;
    confirm: string;
    done: string;
    send: (contractId: string) => Promise<CreatorMoveOutcome>;
  }
> = {
  acknowledge: {
    button: "Acknowledge Invoice",
    title: "Acknowledge Invoice Ini?",
    message: "Rincian tidak bisa diubah lagi setelah ini. Admin lalu mengirim bukti bayar.",
    confirm: "Acknowledge",
    done: "Invoice sudah di-acknowledge.",
    send: acknowledgeInvoice,
  },
  confirm: {
    button: "Konfirmasi Diterima",
    title: "Konfirmasi Pembayaran Diterima?",
    message: "Status jadi Paid dan tidak bisa dibatalkan.",
    confirm: "Konfirmasi",
    done: "Pembayaran dikonfirmasi diterima.",
    send: confirmInvoicePayment,
  },
};

/**
 * The creator's move on an invoice (PBI-13, subtask 13.3): acknowledge a finalized invoice, or
 * confirm the payment once the proof is in. The invoice only ever walks forward, so a move is
 * asked about first and sent only on an explicit yes, with focus on the safe answer; while it is
 * on its way neither button can be pressed, so it is never sent twice (OWASP A06). A refusal
 * keeps the question open with its reason instead of closing as if it had worked.
 */
export function InvoiceMove({
  action,
  contractId,
  onDone,
}: Readonly<{
  action: CreatorInvoiceAction;
  contractId: string;
  /** The move was accepted, with what to tell the creator. */
  onDone: (message: string) => void;
}>) {
  const move = MOVES[action];
  const [asking, setAsking] = useState(false);
  const { busy, refusal, run, clear } = useCreatorMove();
  const cancelRef = useRef<HTMLButtonElement>(null);

  function close() {
    setAsking(false);
    clear();
  }

  function send() {
    return run(
      () => move.send(contractId),
      () => {
        close();
        onDone(move.done);
      },
    );
  }

  return (
    <>
      <Button variant="accent" onClick={() => setAsking(true)}>
        {move.button}
      </Button>

      {asking ? (
        <Modal
          title={move.title}
          role="alertdialog"
          size="compact"
          initialFocus={cancelRef}
          onClose={close}
          footer={
            <>
              <Button ref={cancelRef} onClick={close} disabled={busy}>
                Batal
              </Button>
              <Button variant="accent" onClick={send} disabled={busy}>
                {move.confirm}
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-ink-2">{move.message}</p>
          {refusal === null ? null : (
            <p role="alert" className="mt-3 text-[13px] text-red-ink">
              {refusal}
            </p>
          )}
        </Modal>
      ) : null}
    </>
  );
}
