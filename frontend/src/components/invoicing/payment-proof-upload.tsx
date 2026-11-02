"use client";

import { useId, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FIELD_ERROR } from "@/components/ui/form-classes";
import type { InvoiceStatus } from "@/lib/invoice";
import {
  canUploadProof,
  PROOF_TYPES,
  UPLOAD_FAILED,
  validateProofFile,
} from "@/lib/invoice-payment";
import { uploadPaymentProof, type UploadOutcome } from "@/lib/invoice-payment-actions.server";
import type { PaymentProof } from "@/lib/invoice-payment-api";
import { ProofLink } from "./proof-link";

// What the control needs to send a proof: any function that takes the form and answers an
// outcome. The control depends on this, not on the server action (DIP), so a test hands it a stub.
export type ProofUploader = (contractId: string, form: FormData) => Promise<UploadOutcome>;

// Where the upload stands; one state at a time, so "uploading" and an error never show together.
type UploadState =
  | { kind: "idle" }
  | { kind: "picked"; file: File }
  | { kind: "invalid"; message: string }
  | { kind: "uploading"; file: File }
  | { kind: "uploaded"; proof: PaymentProof }
  | { kind: "failed"; file: File; message: string };

// The file the button would send, when there is one it may send.
function sendable(state: UploadState): File | null {
  return state.kind === "picked" || state.kind === "failed" ? state.file : null;
}

// The admin's payment proof upload in the Rincian panel (PBI-13, subtask 13.4), offered only
// while the creator has acknowledged the invoice. A wrong file is named as soon as it is picked;
// the server checks it again. A proof cannot be replaced once sent, so the prototype's question
// comes first. The native input stays for the keyboard and screen readers, drawn as the app's
// own button with the chosen file named beside it, instead of the browser's English control.
export function PaymentProofUpload({
  contractId,
  status,
  upload = uploadPaymentProof,
  onUploaded,
}: Readonly<{
  contractId: string;
  status: InvoiceStatus;
  upload?: ProofUploader;
  // The proof was saved, and this is it; the invoice reads again.
  onUploaded: (proof: PaymentProof) => void;
}>) {
  const inputId = useId();
  const titleId = useId();
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [asking, setAsking] = useState(false);

  if (!canUploadProof(status)) return null;

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cancelling the picker leaves no file: wait for one again rather than check nothing.
    if (!file) {
      setState({ kind: "idle" });
      return;
    }
    const message = validateProofFile(file);
    setState(message ? { kind: "invalid", message } : { kind: "picked", file });
  }

  async function send(file: File) {
    const form = new FormData();
    form.set("file", file);
    setState({ kind: "uploading", file });

    // A call that throws (the network, say) reads as a failed upload, never as uploading for ever.
    const outcome = await upload(contractId, form).catch(
      (): UploadOutcome => ({ ok: false, message: UPLOAD_FAILED }),
    );
    if (outcome.ok) {
      setState({ kind: "uploaded", proof: outcome.proof });
      onUploaded(outcome.proof);
    } else {
      setState({ kind: "failed", file, message: outcome.message });
    }
  }

  const file = sendable(state);
  const chosen = state.kind === "picked" || state.kind === "uploading" || state.kind === "failed"
    ? state.file.name
    : null;

  return (
    <section aria-label="Upload bukti pembayaran" className="flex flex-col gap-2 text-[13px]">
      <p id={titleId} className="font-semibold">
        File bukti pembayaran
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <input
          id={inputId}
          type="file"
          aria-labelledby={titleId}
          accept={PROOF_TYPES.join(",")}
          onChange={pick}
          disabled={state.kind === "uploading"}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className={`${buttonClasses()} inline-flex items-center peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-40`}
        >
          Pilih file
        </label>
        <span className={`min-w-0 break-all ${chosen === null ? "text-muted" : ""}`}>
          {chosen ?? "Belum ada file dipilih"}
        </span>
      </div>

      <div>
        <Button disabled={file === null} onClick={() => setAsking(true)}>
          Upload bukti
        </Button>
      </div>

      {asking && file ? (
        <ConfirmDialog
          title="Kirim bukti pembayaran?"
          message="Creator akan diminta mengonfirmasi bahwa pembayaran sudah diterima. Bukti tidak bisa diganti setelah terkirim."
          confirmLabel="Kirim Bukti"
          cancelLabel="Batal"
          confirmVariant="accent"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            void send(file);
          }}
        />
      ) : null}

      {state.kind === "uploading" ? (
        <p role="status" className="text-muted">
          Mengunggah…
        </p>
      ) : null}

      {state.kind === "invalid" || state.kind === "failed" ? (
        <p role="alert" className={FIELD_ERROR}>
          {state.message}
        </p>
      ) : null}

      {state.kind === "uploaded" ? (
        <p>
          <ProofLink proof={state.proof} />
        </p>
      ) : null}
    </section>
  );
}
