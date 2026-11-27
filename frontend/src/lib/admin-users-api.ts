// The four calls that change an admin (PBI-23, 23.4), kept out of the screens: POST
// /admin-users adds one, PATCH /admin-users/:id changes a name or role, and /deactivate and
// /reactivate switch one off and on. The email code that covers the sensitive ones is held on the
// signed-in session by the backend, so no request here carries it. Outcomes, never a status code or a body, so the forms and
// the row actions read the same refusal words and cannot disagree with lib/admin-user-form.ts.

import { apiFetch } from "./api-client";
import { adminRefusal, type AdminFormErrors } from "./admin-user-form";
import type { AdminRole } from "./admin-users";
import { readBody } from "./response-body";

export type AdminSaveOutcome =
  | { ok: true }
  | { ok: false; message: string; errors: AdminFormErrors };

const SAVE_FAILED = "Admin gagal disimpan. Coba lagi.";
const CHANGE_FAILED = "Admin gagal diubah. Coba lagi.";

interface RefusalBody {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
}

const FORM_FIELDS = ["name", "email", "role"] as const;

/** The fields a 422 named that the form has; a field it does not draw is left out. */
function fieldErrors(raw: unknown): AdminFormErrors {
  const errors: AdminFormErrors = {};
  if (raw === null || typeof raw !== "object") {
    return errors;
  }
  const named = raw as Record<string, unknown>;
  for (const field of FORM_FIELDS) {
    if (typeof named[field] === "string") {
      errors[field] = named[field];
    }
  }
  return errors;
}

async function send(path: string, method: string, body?: unknown): Promise<Response> {
  return apiFetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

/**
 * A refusal the backend wrote for the admin (4xx with a message) is shown; anything else, a
 * server error above all, is replaced by the form's own line (OWASP A10).
 */
async function settle(response: Response, failed: string): Promise<AdminSaveOutcome> {
  if (response.ok) {
    return { ok: true };
  }

  const body = (await readBody(response)) as RefusalBody | null;
  const refusal = adminRefusal(body?.code);
  if (refusal) {
    return { ok: false, ...refusal };
  }

  const refused = response.status < 500;
  return {
    ok: false,
    message: refused && typeof body?.message === "string" ? body.message : failed,
    errors: refused ? fieldErrors(body?.errors) : {},
  };
}

export async function createAdmin(values: {
  name: string;
  email: string;
  role: AdminRole;
}): Promise<AdminSaveOutcome> {
  return settle(
    await send("/api/admin-users", "POST", {
      name: values.name.trim(),
      email: values.email.trim(),
      role: values.role,
    }),
    SAVE_FAILED,
  );
}

function adminPath(id: string, action = ""): string {
  return `/api/admin-users/${encodeURIComponent(id)}${action}`;
}

/** A name, and a role only when it changed; the backend checks the session's code for that. */
export async function updateAdmin(
  id: string,
  patch: { name: string; role?: AdminRole },
): Promise<AdminSaveOutcome> {
  const body = patch.role
    ? { name: patch.name.trim(), role: patch.role }
    : { name: patch.name.trim() };

  return settle(await send(adminPath(id), "PATCH", body), SAVE_FAILED);
}

export async function deactivateAdmin(id: string): Promise<AdminSaveOutcome> {
  return settle(await send(adminPath(id, "/deactivate"), "POST"), CHANGE_FAILED);
}

/** Reactivating an Admin asks for no code (AC 9); bringing back a Super Admin does. */
export async function reactivateAdmin(id: string): Promise<AdminSaveOutcome> {
  return settle(await send(adminPath(id, "/reactivate"), "POST"), CHANGE_FAILED);
}

/** One confirmation covers the role change and the deactivation for this long (AC 11). */
export const CONFIRMATION_MINUTES = 15;

/** How long an emailed code itself lasts, when the backend's answer does not say. */
export const CODE_MINUTES = 10;

/** The changes the backend holds until the email code was entered. */
export type SensitiveAction =
  | "role_change"
  | "deactivate"
  | "add_super_admin"
  | "reactivate_super_admin";

export type ConfirmationRequest =
  | { kind: "sent"; message: string; validMinutes: number }
  | { kind: "limited"; message: string }
  | { kind: "failed"; message: string };

export type ConfirmationVerify =
  | { kind: "confirmed"; expiresAt: string }
  | { kind: "wrong"; attemptsLeft?: number }
  | { kind: "expired" }
  | { kind: "failed" };

interface ConfirmationBody {
  validMinutes?: unknown;
  confirmedUntil?: unknown;
  code?: unknown;
  attemptsLeft?: unknown;
  retryAfterMinutes?: unknown;
}

/** Asks the backend to email a code to the signed-in Super Admin. */
export async function requestConfirmation(): Promise<ConfirmationRequest> {
  const response = await send("/api/admin-users/confirmation", "POST");
  const body = (await readBody(response)) as ConfirmationBody | null;

  if (response.ok) {
    const minutes = body?.validMinutes;
    return {
      kind: "sent",
      message: "Kode dikirim ke email kamu.",
      validMinutes:
        typeof minutes === "number" && Number.isInteger(minutes) && minutes > 0
          ? minutes
          : CODE_MINUTES,
    };
  }

  if (response.status === 429) {
    const minutes = body?.retryAfterMinutes;
    return {
      kind: "limited",
      message:
        Number.isInteger(minutes) && Number(minutes) > 0
          ? `Terlalu sering meminta kode. Coba lagi dalam ${String(minutes)} menit.`
          : "Terlalu sering meminta kode. Coba lagi nanti.",
    };
  }

  return { kind: "failed", message: "Kode gagal dikirim. Coba lagi." };
}

/**
 * Checks the six digits. A right code confirms this session until the time the backend names; a
 * used-up or old code comes back as expired, so the prompt asks for a new one.
 */
export async function verifyConfirmation(code: string): Promise<ConfirmationVerify> {
  const response = await send("/api/admin-users/confirmation/verify", "POST", { code });
  const body = (await readBody(response)) as ConfirmationBody | null;

  if (response.ok && typeof body?.confirmedUntil === "string") {
    return { kind: "confirmed", expiresAt: body.confirmedUntil };
  }

  if (response.status === 422 && body?.code === "CONFIRMATION_WRONG") {
    return Number.isInteger(body.attemptsLeft)
      ? { kind: "wrong", attemptsLeft: Number(body.attemptsLeft) }
      : { kind: "wrong" };
  }

  if (response.status === 422 && body?.code === "CONFIRMATION_EXPIRED") {
    return { kind: "expired" };
  }

  return { kind: "failed" };
}
