"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { CodeBoxes, CODE_LENGTH } from "@/components/auth/code-boxes";
import { useCountdown } from "@/components/auth/use-countdown";
import { Button } from "@/components/ui/button";
import { ALERT } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import {
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
};

/**
 * The email-code prompt in front of a role change or a deactivation (AC 11). It sends a code
 * when it opens, checks the six digits, and hands the confirmed id back; the action itself
 * waits until then, so the page never changes a role or an account on an unchecked code.
 */
export function AdminCodePrompt({
  action,
  onConfirmed,
  onCancel,
}: {
  action: SensitiveAction;
  onConfirmed: (confirmationId: string, expiresAt: string) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const problemId = useId();
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const { secondsLeft, restart } = useCountdown(RESEND_AFTER_SECONDS);

  const ask = useCallback(async () => {
    setBusy(true);
    setProblem(null);

    try {
      const outcome = await requestConfirmation(action);
      setRequest(outcome);
      if (outcome.kind === "limited" || outcome.kind === "failed") {
        setProblem(outcome.message);
      }
    } finally {
      setBusy(false);
    }
  }, [action]);

  // One code per opening; a later one is the resend button's work. The request is queued a tick
  // after mounting so the opening render settles before it flips the prompt's busy state.
  useEffect(() => {
    queueMicrotask(() => {
      void ask();
    });
  }, [ask]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const confirmationId = request?.kind === "sent" ? request.confirmationId : null;
    if (!confirmationId) {
      return;
    }
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      setProblem(INCOMPLETE);
      return;
    }

    setBusy(true);
    setProblem(null);

    try {
      const outcome = await verifyConfirmation(confirmationId, code);

      if (outcome.kind === "confirmed") {
        onConfirmed(confirmationId, outcome.expiresAt);
        return;
      }

      if (outcome.kind === "wrong") {
        setProblem(
          outcome.attemptsLeft === undefined
            ? "Kode salah."
            : `Kode salah. Sisa ${outcome.attemptsLeft} percobaan.`,
        );
      } else if (outcome.kind === "expired") {
        setProblem(EXPIRED);
      } else if (outcome.kind === "limited") {
        setProblem(outcome.message);
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
          {ACTION_NAME[action]} perlu kode dari email kamu. Kode berlaku {CONFIRMATION_MINUTES}{" "}
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
          <div className="mt-4 flex flex-col gap-3">
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
