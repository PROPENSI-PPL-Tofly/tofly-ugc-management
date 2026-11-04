// Signing in with an email code as a state machine (State pattern): each step is its own shape,
// and each event either moves the flow on or leaves it as it is. The screen only renders the
// state and dispatches events, so every path can be tested without a browser.

import { EMAIL_FORMAT, MAX_EMAIL_LENGTH } from "@/lib/creator-form";
import type { CodeRequestOutcome, CodeVerifyOutcome } from "@/lib/email-sign-in-api";
import { EMAIL_SIGN_IN_TEXT, limitedText, wrongCodeText } from "@/lib/email-sign-in-messages";

export type ClosedStep = { step: "closed" };

export type EmailStep = {
  step: "email";
  email: string;
  busy: boolean;
  error: string | null;
  fieldError: string | null;
};

export type CodeStep = {
  step: "code";
  email: string;
  code: string;
  busy: boolean;
  notice: string | null;
  error: string | null;
  /** Marks the boxes after a refused code. */
  invalid: boolean;
};

export type Flow = ClosedStep | EmailStep | CodeStep;

export type FlowEvent =
  | { type: "open" }
  | { type: "emailTyped"; email: string }
  | { type: "emailRefused"; problem: string }
  | { type: "requestStarted" }
  | { type: "requestAnswered"; outcome: CodeRequestOutcome }
  | { type: "codeTyped"; code: string }
  | { type: "verifyStarted" }
  | { type: "verifyAnswered"; outcome: CodeVerifyOutcome }
  | { type: "changeEmail" };

export const CLOSED: ClosedStep = { step: "closed" };

/** Checked before sending, in the API's words (AC 2: a valid format, at most 254 characters). */
export function emailProblem(value: string): string | null {
  const email = value.trim();
  if (email === "") return "Email wajib diisi";
  if (email.length > MAX_EMAIL_LENGTH) return `Email maksimal ${MAX_EMAIL_LENGTH} karakter`;
  return EMAIL_FORMAT.test(email) ? null : "Format email tidak valid";
}

function emailStep(email: string): EmailStep {
  return { step: "email", email, busy: false, error: null, fieldError: null };
}

/** A fresh code step: the boxes empty and the AC 2 sentence, the same for every address. */
function codeStep(email: string): CodeStep {
  return {
    step: "code",
    email,
    code: "",
    busy: false,
    notice: EMAIL_SIGN_IN_TEXT.sent,
    error: null,
    invalid: false,
  };
}

/** What a refused request says; null for a request that was answered with a code. */
function requestRefusal(outcome: CodeRequestOutcome): string | null {
  switch (outcome.kind) {
    case "sent":
      return null;
    case "limited":
      return limitedText(outcome.minutes);
    case "send_failed":
      return EMAIL_SIGN_IN_TEXT.sendFailed;
    case "invalid":
      return outcome.message;
  }
}

function requestAnswered(flow: EmailStep | CodeStep, outcome: CodeRequestOutcome): Flow {
  const refusal = requestRefusal(outcome);
  if (refusal === null) return codeStep(flow.email);
  if (flow.step === "code") return { ...flow, busy: false, error: refusal };
  return outcome.kind === "invalid"
    ? { ...flow, busy: false, fieldError: refusal }
    : { ...flow, busy: false, error: refusal };
}

function verifyAnswered(flow: CodeStep, outcome: CodeVerifyOutcome): Flow {
  const refused = (error: string, invalid: boolean): CodeStep => ({
    ...flow,
    code: "",
    busy: false,
    error,
    invalid,
  });
  switch (outcome.kind) {
    case "signed_in":
      return flow;
    case "wrong":
      return refused(wrongCodeText(outcome.attemptsLeft), true);
    case "expired":
      return refused(EMAIL_SIGN_IN_TEXT.expired, true);
    case "denied":
      return refused(EMAIL_SIGN_IN_TEXT.denied, false);
    case "failed":
      return refused(EMAIL_SIGN_IN_TEXT.signInFailed, false);
    case "invalid":
      return refused(outcome.message, true);
  }
}

function onEmailStep(flow: EmailStep, event: FlowEvent): Flow {
  switch (event.type) {
    case "emailTyped":
      return { ...flow, email: event.email, fieldError: null };
    case "emailRefused":
      return { ...flow, fieldError: event.problem };
    default:
      return flow;
  }
}

function onCodeStep(flow: CodeStep, event: FlowEvent): Flow {
  switch (event.type) {
    case "codeTyped":
      return { ...flow, code: event.code, invalid: false, error: null };
    case "verifyStarted":
      return { ...flow, busy: true, error: null, notice: null };
    case "verifyAnswered":
      return verifyAnswered(flow, event.outcome);
    case "changeEmail":
      return emailStep(flow.email);
    default:
      return flow;
  }
}

export function emailSignInFlow(flow: Flow, event: FlowEvent): Flow {
  if (flow.step === "closed") return event.type === "open" ? emailStep("") : flow;
  if (event.type === "requestStarted") return { ...flow, busy: true, error: null };
  if (event.type === "requestAnswered") return requestAnswered(flow, event.outcome);
  return flow.step === "email" ? onEmailStep(flow, event) : onCodeStep(flow, event);
}
