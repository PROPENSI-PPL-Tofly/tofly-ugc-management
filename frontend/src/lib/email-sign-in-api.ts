// The two calls behind signing in with an email code (PBI-39), kept out of the screens: POST
// /auth/email/request (39.2) sends a code, POST /auth/email/verify (39.3) checks it and starts the
// session. The screens read outcomes, never a status code or a body, so this file is the one
// place that knows how the backend answers. Both go through this app's /api proxy, same-origin.

import { readBody } from "./response-body";
import { homeFor } from "./session";

export type CodeRequestOutcome =
  | { kind: "sent"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "limited"; message: string }
  | { kind: "not_sent"; message: string };

export type CodeVerifyOutcome =
  | { kind: "signed_in"; redirectTo: string }
  | { kind: "wrong"; attemptsLeft?: number }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "failed" };

/** 39.2's answer for every address, registered or not. */
const CODE_SENT = "Kalau email kamu terdaftar, kode sudah dikirim.";
const CODE_NOT_SENT = "Kode gagal dikirim. Coba lagi.";
const EMAIL_FORMAT_PROBLEM = "Format email tidak valid";

function limitedMessage(minutes: unknown): string {
  return Number.isInteger(minutes) && (minutes as number) > 0
    ? `Terlalu banyak permintaan. Coba lagi dalam ${minutes as number} menit.`
    : "Terlalu banyak permintaan. Coba lagi nanti.";
}

/**
 * Only a role's home is followed (OWASP A01). The backend sends nothing else today, but a
 * sign-in that lands wherever a response says would be an open redirect the moment that changed.
 * Anything else goes to `/`, which sends a signed-in user home anyway.
 */
function safeDestination(value: unknown): string {
  return value === homeFor("admin") || value === homeFor("creator") ? value : "/";
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`/api/auth/email/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

interface AnswerBody {
  code?: unknown;
  retryAfterMinutes?: unknown;
  attemptsLeft?: unknown;
  redirectTo?: unknown;
  errors?: { email?: unknown };
}

async function answerOf(path: string, body: unknown): Promise<{ status: number; body: AnswerBody }> {
  const response = await post(path, body);
  const read = await readBody(response);
  return { status: response.status, body: (read ?? {}) as AnswerBody };
}

/** Asks for a code. A network failure or an answer nobody planned for reads as not sent. */
export async function requestCode(email: string): Promise<CodeRequestOutcome> {
  try {
    const { status, body } = await answerOf("request", { email });
    if (status === 200) return { kind: "sent", message: CODE_SENT };
    if (status === 429) return { kind: "limited", message: limitedMessage(body.retryAfterMinutes) };
    if (status === 422) {
      const problem = body.errors?.email;
      return {
        kind: "invalid",
        message: typeof problem === "string" ? problem : EMAIL_FORMAT_PROBLEM,
      };
    }
  } catch {
    // Fall through: the browser could not reach the app.
  }
  return { kind: "not_sent", message: CODE_NOT_SENT };
}

/** Checks a code. On success the backend has already set the session cookie. */
export async function verifyCode(email: string, code: string): Promise<CodeVerifyOutcome> {
  try {
    const { status, body } = await answerOf("verify", { email, code });
    if (status === 200) return { kind: "signed_in", redirectTo: safeDestination(body.redirectTo) };
    if (status === 422 && body.code === "CODE_WRONG") {
      return Number.isInteger(body.attemptsLeft) && (body.attemptsLeft as number) >= 0
        ? { kind: "wrong", attemptsLeft: body.attemptsLeft as number }
        : { kind: "wrong" };
    }
    if (status === 422) return { kind: "invalid" };
    if (status === 410 && body.code === "CODE_EXPIRED") return { kind: "expired" };
    if (status === 403 && body.code === "ACCESS_DENIED") return { kind: "denied" };
  } catch {
    // Fall through: the browser could not reach the app.
  }
  return { kind: "failed" };
}
