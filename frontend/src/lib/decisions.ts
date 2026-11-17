// An admin's decision sent from the browser: one request, one refusal type. Shared by the draft
// decisions (approve, revise) and the proposal decisions (approve, reject), so a refusal reads
// the same and is handled by status (404, 409) whichever decision it came from. Through this
// app's /api proxy, so BACKEND_URL never reaches the browser.

import { apiFetch } from "./api-client";

/** A failed decision, keeping the HTTP status so 404 and 409 can read differently. */
export class DecisionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DecisionError";
  }
}

/** What the backend answers an error with: sometimes a flat message, sometimes field errors. */
interface FailureBody {
  message?: string;
  errors?: Record<string, string>;
}

async function readMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as FailureBody;
    const fieldErrors = body.errors ? Object.values(body.errors) : [];
    return fieldErrors.find(Boolean) ?? body.message ?? null;
  } catch {
    return null;
  }
}

/**
 * Sends one admin decision through the /api proxy and resolves once the backend accepted it.
 * Shared by the draft and the proposal decisions, so a refusal reads the same from either.
 */
export async function sendDecision(
  url: string,
  method: "PATCH" | "POST",
  fallbackMessage: string,
  body?: Record<string, unknown>,
): Promise<void> {
  await send(url, method, fallbackMessage, body);
}

/**
 * Like sendDecision, for a request whose answer the admin's screen shows next (the saved
 * follow-up note): the same refusals, then the backend's JSON body.
 */
export async function sendAndRead<T>(
  url: string,
  method: "PATCH" | "POST",
  fallbackMessage: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await send(url, method, fallbackMessage, body);
  return (await response.json()) as T;
}

async function send(
  url: string,
  method: "PATCH" | "POST",
  fallbackMessage: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const response = await apiFetch(url, {
    method,
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });

  if (!response.ok) {
    // Only a 4xx carries a message written for the admin; a 5xx body is the server's or a
    // gateway's own wording and may describe internals, so it is never shown.
    const message = response.status < 500 ? await readMessage(response) : null;
    throw new DecisionError(response.status, message ?? fallbackMessage);
  }

  return response;
}
