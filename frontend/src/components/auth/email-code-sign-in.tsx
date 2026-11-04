"use client";

import { useEffect, useId, useReducer, useRef, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { FIELD, FIELD_ERROR } from "@/components/ui/form-classes";
import { requestSignInCode, verifySignInCode } from "@/lib/email-sign-in-api";
import { CODE_LENGTH, CodeBoxes } from "./code-boxes";
import { CLOSED, emailProblem, emailSignInFlow, type CodeStep } from "./email-sign-in-flow";
import { useCountdown } from "./use-countdown";

const ALERT =
  "rounded-(--radius-control) border border-red-wash bg-red-wash px-3 py-2 text-[13px] text-red-ink";
const NOTICE =
  "rounded-(--radius-control) border border-rule bg-surface-2 px-3 py-2 text-[13px] text-ink";
const WIDE = "flex w-full items-center justify-center py-2 text-[13px]";
const COMPLETE_CODE = new RegExp(`^\\d{${CODE_LENGTH}}$`);

/**
 * "Masuk dengan Kode Email" (PBI-39): the second way in beside Google, for a creator or admin
 * with no Google account. The steps live in emailSignInFlow; this component draws the current
 * one, calls the backend and starts the resend countdown.
 */
export function EmailCodeSignIn() {
  const [flow, dispatch] = useReducer(emailSignInFlow, CLOSED);
  const countdown = useCountdown();
  const ids = useId();

  async function sendCode(email: string) {
    dispatch({ type: "requestStarted" });
    const outcome = await requestSignInCode(email);
    dispatch({ type: "requestAnswered", outcome });
    if (outcome.kind === "sent") countdown.start(outcome.resendAfterSeconds);
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flow.step !== "email") return;
    const email = flow.email.trim();
    const problem = emailProblem(email);
    if (problem !== null) {
      dispatch({ type: "emailRefused", problem });
      return;
    }
    dispatch({ type: "emailTyped", email });
    void sendCode(email);
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flow.step !== "code") return;
    dispatch({ type: "verifyStarted" });
    const outcome = await verifySignInCode(flow.email, flow.code);
    dispatch({ type: "verifyAnswered", outcome });
    // A full page load, as after Google: the router cache holds nothing for the new session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (outcome.kind === "signed_in") window.location.assign(outcome.redirectTo);
  }

  if (flow.step === "closed") {
    return (
      <button
        type="button"
        onClick={() => dispatch({ type: "open" })}
        className={`${buttonClasses()} ${WIDE}`}
      >
        Masuk dengan Kode Email
      </button>
    );
  }

  if (flow.step === "email") {
    const emailId = `${ids}-email`;
    const fieldErrorId = `${ids}-email-error`;
    return (
      <form noValidate onSubmit={submitEmail} className="flex flex-col gap-3">
        <label htmlFor={emailId} className="text-[13px] font-semibold text-ink">
          Email
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          // The step was opened on purpose; the field is what it is for.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={flow.email}
          onChange={(event) => dispatch({ type: "emailTyped", email: event.target.value })}
          aria-invalid={flow.fieldError !== null}
          aria-describedby={flow.fieldError === null ? undefined : fieldErrorId}
          className={FIELD}
        />
        {flow.fieldError === null ? null : (
          <p id={fieldErrorId} className={FIELD_ERROR}>
            {flow.fieldError}
          </p>
        )}
        {flow.error === null ? null : (
          <p role="alert" className={ALERT}>
            {flow.error}
          </p>
        )}
        <button
          type="submit"
          disabled={flow.busy}
          className={`${buttonClasses("accent")} ${WIDE}`}
        >
          {flow.busy ? "Mengirim…" : "Kirim Kode"}
        </button>
      </form>
    );
  }

  return (
    <CodeForm
      flow={flow}
      ids={ids}
      secondsLeft={countdown.secondsLeft}
      onCode={(code) => dispatch({ type: "codeTyped", code })}
      onSubmit={submitCode}
      onResend={() => void sendCode(flow.email)}
      onChangeEmail={() => dispatch({ type: "changeEmail" })}
    />
  );
}

function CodeForm({
  flow,
  ids,
  secondsLeft,
  onCode,
  onSubmit,
  onResend,
  onChangeEmail,
}: {
  flow: CodeStep;
  ids: string;
  secondsLeft: number;
  onCode: (code: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const boxes = useRef<HTMLDivElement>(null);
  const errorId = `${ids}-code-error`;
  const ready = !flow.busy && flow.code === "";

  // Into the first box when the step opens and after a refused code, so the next try is typed.
  useEffect(() => {
    if (ready) (boxes.current as HTMLDivElement).querySelector("input")?.focus();
  }, [ready]);

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
      {flow.notice === null ? null : (
        <p role="status" className={NOTICE}>
          {flow.notice}
        </p>
      )}
      <p className="text-[13px] text-muted">
        Masukkan kode 6 digit untuk <span className="font-semibold text-ink">{flow.email}</span>
      </p>
      <div ref={boxes}>
        <CodeBoxes
          value={flow.code}
          onChange={onCode}
          disabled={flow.busy}
          invalid={flow.invalid}
          describedBy={flow.error === null ? undefined : errorId}
        />
      </div>
      {flow.error === null ? null : (
        <p id={errorId} role="alert" className={ALERT}>
          {flow.error}
        </p>
      )}
      <button
        type="submit"
        disabled={flow.busy || !COMPLETE_CODE.test(flow.code)}
        className={`${buttonClasses("accent")} ${WIDE}`}
      >
        {flow.busy ? "Memeriksa…" : "Masuk"}
      </button>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onChangeEmail}
          disabled={flow.busy}
          className={buttonClasses("ghost")}
        >
          Ganti email
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={flow.busy || secondsLeft > 0}
          className={buttonClasses()}
        >
          {secondsLeft > 0 ? `Kirim Ulang (${secondsLeft} detik)` : "Kirim Ulang"}
        </button>
      </div>
    </form>
  );
}
