"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ALERT, FIELD, FIELD_ERROR } from "@/components/ui/form-classes";
import { EMAIL_FORMAT, MAX_EMAIL_LENGTH } from "@/lib/creator-form";
import {
  requestCode,
  verifyCode,
  type CodeRequestOutcome,
  type CodeVerifyOutcome,
} from "@/lib/email-sign-in-api";
import { CODE_LENGTH, CodeBoxes } from "./code-boxes";
import { useCountdown } from "./use-countdown";

/** AC: "Kirim Ulang" unlocks this long after a code was sent. */
export const RESEND_AFTER_SECONDS = 60;

const NOTICE =
  "rounded-(--radius-control) border border-green-wash bg-green-wash px-3 py-2 text-[13px] text-green-ink";
const WIDE = "flex w-full items-center justify-center py-2 text-[13px]";

const INCOMPLETE_CODE = "Masukkan 6 digit kode.";
const CODE_FORMAT = new RegExp(`^\\d{${CODE_LENGTH}}$`);

/** What the screen says about a code that did not sign anyone in; 39.3 leaves the wording here. */
const VERIFY_PROBLEM: Record<Exclude<CodeVerifyOutcome["kind"], "signed_in" | "wrong">, string> = {
  invalid: INCOMPLETE_CODE,
  expired: "Kode sudah tidak berlaku. Minta kode baru dengan Kirim Ulang.",
  denied: "Email ini tidak punya akses ke Tofly. Hubungi Admin untuk meminta akses.",
  failed: "Gagal masuk. Silakan coba lagi.",
};

function verifyProblem(outcome: Exclude<CodeVerifyOutcome, { kind: "signed_in" }>): string {
  if (outcome.kind !== "wrong") return VERIFY_PROBLEM[outcome.kind];
  return outcome.attemptsLeft === undefined
    ? "Kode salah."
    : `Kode salah. Sisa ${outcome.attemptsLeft} percobaan.`;
}

/** The same rules the backend applies (39.2), checked first so a typo costs no request. */
function emailProblem(email: string): string | null {
  if (email === "") return "Email wajib diisi";
  if (email.length > MAX_EMAIL_LENGTH) return `Email maksimal ${MAX_EMAIL_LENGTH} karakter`;
  return EMAIL_FORMAT.test(email) ? null : "Format email tidak valid";
}

type Step = "choose" | "email" | "code";

/**
 * Signing in with a code sent by email (PBI-39), beside Google on the login page: the email,
 * then the six-digit code. The code lives in this component's state only, never in storage or
 * a log. A ref guards each call, so a second submit while one is pending sends nothing.
 */
export function EmailCodeSignIn() {
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [sentNotice, setSentNotice] = useState("");

  function codeSent(address: string, notice: string) {
    setEmail(address);
    setSentNotice(notice);
    setStep("code");
  }

  if (step === "choose") {
    return (
      <Button type="button" className={`mt-3 ${WIDE}`} onClick={() => setStep("email")}>
        Masuk dengan Email
      </Button>
    );
  }

  if (step === "email") {
    return (
      <EmailStep initialEmail={email} onCancel={() => setStep("choose")} onSent={codeSent} />
    );
  }

  return (
    <CodeStep
      email={email}
      initialNotice={sentNotice}
      onChangeEmail={() => setStep("email")}
    />
  );
}

function EmailStep({
  initialEmail,
  onCancel,
  onSent,
}: {
  initialEmail: string;
  onCancel: () => void;
  onSent: (email: string, notice: string) => void;
}) {
  const [typed, setTyped] = useState(initialEmail);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const address = typed.trim().toLowerCase();
    const problem = emailProblem(address);
    setAlert(null);
    setFieldError(problem);
    if (problem) return;

    inFlight.current = true;
    setBusy(true);
    const outcome: CodeRequestOutcome = await requestCode(address);
    inFlight.current = false;
    setBusy(false);
    if (outcome.kind === "sent") onSent(address, outcome.message);
    else if (outcome.kind === "invalid") setFieldError(outcome.message);
    else setAlert(outcome.message);
  }

  return (
    <form noValidate onSubmit={submit} className="mt-5 flex flex-col gap-3 border-t border-rule pt-5">
      <label htmlFor="sign-in-email" className="text-[13px] font-semibold text-ink">
        Email
      </label>
      <input
        ref={field}
        id="sign-in-email"
        type="email"
        autoComplete="email"
        value={typed}
        disabled={busy}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? "sign-in-email-error" : undefined}
        onChange={(event) => {
          setTyped(event.target.value);
          setFieldError(null);
          setAlert(null);
        }}
        className={FIELD}
      />
      {fieldError ? (
        <p id="sign-in-email-error" className={FIELD_ERROR}>
          {fieldError}
        </p>
      ) : null}
      {alert ? (
        <p role="alert" className={ALERT}>
          {alert}
        </p>
      ) : null}
      <Button type="submit" variant="accent" disabled={busy} className={WIDE}>
        {busy ? "Mengirim…" : "Kirim Kode"}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} className={WIDE}>
        Batal
      </Button>
    </form>
  );
}

function CodeStep({
  email,
  initialNotice,
  onChangeEmail,
}: {
  email: string;
  initialNotice: string;
  onChangeEmail: () => void;
}) {
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [alert, setAlert] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
  const inFlight = useRef(false);
  const boxesRef = useRef<HTMLDivElement>(null);
  const { secondsLeft, restart } = useCountdown(RESEND_AFTER_SECONDS);

  function focusFirstBox() {
    boxesRef.current?.querySelector("input")?.focus();
  }

  // On arrival, and each time the boxes unlock after a check or a resend: they cannot take focus
  // while disabled, so this waits for the render that enables them.
  useEffect(() => {
    if (busy === null) focusFirstBox();
  }, [busy]);

  function startOver(problem: string | null) {
    setAlert(problem);
    setInvalid(problem !== null);
    setCode("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!CODE_FORMAT.test(code)) {
      setAlert(INCOMPLETE_CODE);
      setInvalid(true);
      return;
    }

    inFlight.current = true;
    setBusy("verify");
    const outcome = await verifyCode(email, code);
    if (outcome.kind === "signed_in") {
      // A full page load, as after Google: the session cookie is new, and no page rendered
      // before it may survive in the router cache. The screen stays locked while it leaves.
      window.location.assign(outcome.redirectTo);
      return;
    }
    inFlight.current = false;
    setBusy(null);
    startOver(verifyProblem(outcome));
  }

  async function resend() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("resend");
    setAlert(null);
    const outcome = await requestCode(email);
    inFlight.current = false;
    setBusy(null);
    if (outcome.kind !== "sent") {
      setAlert(outcome.message);
      return;
    }
    // The backend makes the new code the only one that works; the screen only starts over.
    setNotice(outcome.message);
    restart();
    startOver(null);
  }

  const locked = busy !== null;

  return (
    <form noValidate onSubmit={submit} className="mt-5 flex flex-col gap-3 border-t border-rule pt-5">
      <p role="status" className={NOTICE}>
        {notice}
      </p>
      <p id="sign-in-code-help" className="text-[13px] text-muted">
        Masukkan 6 digit kode yang dikirim ke <span className="font-semibold text-ink">{email}</span>.
        Kode berlaku 10 menit.
      </p>
      <div ref={boxesRef}>
        <CodeBoxes
          value={code}
          onChange={(next) => {
            setCode(next);
            setAlert(null);
            setInvalid(false);
          }}
          disabled={locked}
          invalid={invalid}
          describedBy="sign-in-code-help"
        />
      </div>
      {alert ? (
        <p role="alert" className={ALERT}>
          {alert}
        </p>
      ) : null}
      <Button type="submit" variant="accent" disabled={locked} className={WIDE}>
        {busy === "verify" ? "Memeriksa…" : "Masuk"}
      </Button>
      <Button
        type="button"
        disabled={locked || secondsLeft > 0}
        onClick={resend}
        className={WIDE}
      >
        {busy === "resend"
          ? "Mengirim…"
          : secondsLeft > 0
            ? `Kirim Ulang (${secondsLeft} detik)`
            : "Kirim Ulang"}
      </Button>
      <Button type="button" variant="ghost" disabled={locked} onClick={onChangeEmail} className={WIDE}>
        Ganti email
      </Button>
    </form>
  );
}
