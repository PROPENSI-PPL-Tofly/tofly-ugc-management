// "Ubah Data" from the browser (PBI-16, 16.2): PATCH /creators/:id through the same-origin /api
// proxy. The server decides; its answer comes back as the form's messages.

import { apiFetch } from "./api-client";
import type { CreatorEditRequest } from "./creator-edit";
import { isUuid } from "./creator-detail";
import type { CreatorFormErrors } from "./creator-form";
import { readFieldErrors } from "./creators";

export type SaveCreatorEditResult =
  | { ok: true }
  | { ok: false; message: string; errors: CreatorFormErrors };

/** The fields the form shows a message under; nothing else from a 422 is kept. */
const EDIT_FIELDS = [
  "name",
  "email",
  "instagramUsername",
  "tiktokUsername",
  "contractType",
  "fixedRate",
  "contractEnd",
  "quota",
] as const satisfies readonly (keyof CreatorFormErrors)[];

export async function saveCreatorEdit(
  creatorId: string,
  request: CreatorEditRequest,
): Promise<SaveCreatorEditResult> {
  const failed: SaveCreatorEditResult = {
    ok: false,
    message: "Perubahan gagal disimpan. Coba lagi.",
    errors: {},
  };
  if (!isUuid(creatorId)) return failed;

  let response: Response;
  try {
    response = await apiFetch(`/api/creators/${creatorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return failed;
  }

  if (response.ok) return { ok: true };
  if (response.status === 422) {
    const body: unknown = await response.json().catch(() => null);
    return { ok: false, message: "Data creator tidak valid", errors: readFieldErrors(body, EDIT_FIELDS) };
  }
  // A lock closed, or the period went, while the form was open.
  if (response.status === 404 || response.status === 409) {
    return {
      ok: false,
      message: "Data creator sudah berubah. Muat ulang halaman lalu coba lagi.",
      errors: {},
    };
  }
  return failed;
}
