"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CodeBoxes, CODE_LENGTH } from "@/components/auth/code-boxes";
import { useCountdown } from "@/components/auth/use-countdown";
import { useFirstBoxFocus } from "@/components/auth/use-first-box-focus";
import { Button } from "@/components/ui/button";
import { ALERT } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import {
  CODE_MINUTES,
  CONFIRMATION_MINUTES,
  requestConfirmation,
  verifyConfirmation,
  type ConfirmationRequest,
  type SensitiveAction,
} from "@/lib/admin-users-api";

/** The same pause between codes the sign-in screen asks for. */
export const RESEND_AFTER_SECONDS = 60;

const INCOMPLETE = `Masukkan ${CODE_LENGTH} digit kode.`;
const EXPIRED = "Kode sudah kedaluwarsa. Kirim ulang kode.";
const CHECK_FAILED = "Kode tidak bisa diperiksa. Coba lagi.";

const ACTION_NAME: Record<SensitiveAction, string> = {
  role_change: "Mengubah peran",
  deactivate: "Menonaktifkan admin",
  add_super_admin: "Menambah Super Admin",
  reactivate_super_admin: "Mengaktifkan kembali Super Admin",
};

/**
 * The email-code prompt in front of a sensitive change (AC 11). It sends a code when it opens,
 * checks the six digits, and says until when the session is confirmed; the action itself waits
 * until then, so the page never sends the change on an unchecked code.
 */
export function AdminCodePrompt({
  action,
  onConfirmed,
  onCancel,
}: {
  action: SensitiveAction;
  onConfirmed: (expiresAt: string) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const problemId = useId();
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const { secondsLeft, restart } = useCountdown(RESEND_AFTER_SECONDS);
  const asked = useRef(false);
  // As on the sign-in screen, the cursor returns to the first box after the send, a check or a resend.
  const boxesRef = useFirstBoxFocus(request?.kind === "sent" && !busy);

  /** A wrong code or a new one starts from empty boxes, so nothing is typed over old digits. */
  function startOver(next: string | null) {
    setProblem(next);
    setCode("");
  }

  const ask = useCallback(async () => {
    setBusy(true);
    startOver(null);

    try {
      const outcome = await requestConfirmation();
      setRequest(outcome);
      if (outcome.kind === "limited" || outcome.kind === "failed") {
        setProblem(outcome.message);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  // One code per opening; a later one is the resend button's work. The ref holds across the second
  // run StrictMode gives an effect in development, which would otherwise email a second code and
  // leave the first one dead. The request is queued a tick after mounting so the opening render
  // settles before it flips the prompt's busy state.
  useEffect(() => {
    if (asked.current) {
      return;
    }
    asked.current = true;
    queueMicrotask(() => {
      void ask();
    });
  }, [ask]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (request?.kind !== "sent") {
      return;
    }
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      setProblem(INCOMPLETE);
      return;
    }

    setBusy(true);
    setProblem(null);

    try {
      const outcome = await verifyConfirmation(code);

      if (outcome.kind === "confirmed") {
        onConfirmed(outcome.expiresAt);
        return;
      }

      if (outcome.kind === "wrong") {
        startOver(
          outcome.attemptsLeft === undefined
            ? "Kode salah."
            : `Kode salah. Sisa ${outcome.attemptsLeft} percobaan.`,
        );
      } else if (outcome.kind === "expired") {
        startOver(EXPIRED);
      } else {
        setProblem(CHECK_FAILED);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      size="compact"
      title="Konfirmasi lewat email"
      onClose={onCancel}
      footer={
        <>
          <Button type="button" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit" form={formId} disabled={busy || request?.kind !== "sent"}>
            Konfirmasi
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)}>
        <p className="text-[13px] text-ink-2">
          {ACTION_NAME[action]} perlu kode dari email kamu. Kode berlaku{" "}
          {request?.kind === "sent" ? request.validMinutes : CODE_MINUTES} menit.
        </p>
        <p className="mt-1 text-xs text-muted">
          Setelah dikonfirmasi, perubahan berikutnya tidak perlu kode selama {CONFIRMATION_MINUTES}{" "}
          menit.
        </p>

        {request === null ? (
          <p role="status" className="mt-3 text-[13px] text-muted">
            Mengirim kode...
          </p>
        ) : null}

        {problem !== null ? (
          <p id={problemId} role="alert" className={`mt-3 ${ALERT}`}>
            {problem}
          </p>
        ) : null}

        {request?.kind === "sent" ? (
          <div ref={boxesRef} className="mt-4 flex flex-col gap-3">
            <CodeBoxes
              value={code}
              onChange={setCode}
              disabled={busy}
              invalid={problem !== null}
              describedBy={problem === null ? undefined : problemId}
            />
            <button
              type="button"
              className="self-start text-[13px] font-semibold text-link disabled:opacity-50"
              onClick={() => {
                restart();
                void ask();
              }}
              disabled={busy || secondsLeft > 0}
            >
              Kirim ulang kode
            </button>
            {secondsLeft > 0 ? (
              <span className="text-xs text-muted">Kirim ulang dalam {secondsLeft} dtk</span>
            ) : null}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
