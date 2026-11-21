// The four calls that change an admin (PBI-23, 23.4), kept out of the screens: POST
// /admin/users adds one, PATCH /admin/users/:id changes a name or role, and /deactivate and
// /reactivate switch one off and on. Outcomes, never a status code or a body, so the forms and
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

  return {
    ok: false,
    message:
      response.status < 500 && typeof body?.message === "string" ? body.message : failed,
    errors: {},
  };
}

export async function createAdmin(values: {
  name: string;
  email: string;
  role: AdminRole;
}): Promise<AdminSaveOutcome> {
  return settle(
    await send("/api/admin/users", "POST", {
      name: values.name.trim(),
      email: values.email.trim(),
      role: values.role,
    }),
    SAVE_FAILED,
  );
}

/** A changed role carries the confirmation that covered it; a name alone needs none. */
export async function updateAdmin(
  id: string,
  patch: { name: string; role?: AdminRole },
  confirmationId?: string,
): Promise<AdminSaveOutcome> {
  const body = patch.role
    ? { name: patch.name.trim(), role: patch.role, confirmationId }
    : { name: patch.name.trim() };

  return settle(
    await send(`/api/admin/users/${encodeURIComponent(id)}`, "PATCH", body),
    SAVE_FAILED,
  );
}

export async function deactivateAdmin(
  id: string,
  confirmationId: string,
): Promise<AdminSaveOutcome> {
  return settle(
    await send(`/api/admin/users/${encodeURIComponent(id)}/deactivate`, "POST", {
      confirmationId,
    }),
    CHANGE_FAILED,
  );
}

/** Reactivation asks for no code (AC 9): it restores access, it does not remove it. */
export async function reactivateAdmin(id: string): Promise<AdminSaveOutcome> {
  return settle(
    await send(`/api/admin/users/${encodeURIComponent(id)}/reactivate`, "POST"),
    CHANGE_FAILED,
  );
}
