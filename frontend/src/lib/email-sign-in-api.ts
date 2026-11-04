// The two backend calls of signing in with an email code (PBI-39), adapted from HTTP answers to
// outcomes the screens can switch on. The screens never read a status code or a body.

import { apiFetch } from "./api-client";

export type CodeRequestOutcome =
  | { kind: "sent"; resendAfterSeconds: number }
  | { kind: "limited"; minutes: number }
  | { kind: "send_failed" }
  | { kind: "invalid"; message: string };

const DEFAULT_RESEND_SECONDS = 60;
const DEFAULT_WAIT_MINUTES = 60;
const DEFAULT_EMAIL_ERROR = "Format email tidak valid";

type Body = Record<string, unknown>;

function post(path: string, body: Body): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The answer's JSON object, or an empty one for anything else: a proxy page, text, a list. */
async function readBody(response: Response): Promise<Body> {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Body) : {};
}

/** A whole number above 0, or the fallback: never NaN, a fraction or a negative on screen. */
export function positiveWhole(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** The text the backend gave under errors[field], when it gave text. */
export function fieldError(body: Body, field: string): string | undefined {
  const errors = body.errors;
  if (typeof errors !== "object" || errors === null) return undefined;
  const message = (errors as Body)[field];
  return typeof message === "string" ? message : undefined;
}

/** POST /api/auth/email/request (SCRUM-240). */
export async function requestSignInCode(email: string): Promise<CodeRequestOutcome> {
  let response: Response;
  try {
    response = await post("/api/auth/email/request", { email });
  } catch {
    return { kind: "send_failed" };
  }
  const body = await readBody(response);
  if (response.ok) {
    return {
      kind: "sent",
      resendAfterSeconds: positiveWhole(body.resendAfterSeconds, DEFAULT_RESEND_SECONDS),
    };
  }
  if (response.status === 429) {
    return { kind: "limited", minutes: positiveWhole(body.minutesToWait, DEFAULT_WAIT_MINUTES) };
  }
  if (response.status === 422) {
    return { kind: "invalid", message: fieldError(body, "email") ?? DEFAULT_EMAIL_ERROR };
  }
  return { kind: "send_failed" };
}
