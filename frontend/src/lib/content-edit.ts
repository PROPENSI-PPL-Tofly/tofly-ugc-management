// Editing and deleting scheduled content from the admin's Content Detail panel (PBI-25, 25.2).
// The rules are the ones the API judges an edit by (backend content-edit.ts), checked here first
// so the admin sees a problem at the field instead of after a round trip; the API still decides.

import { apiFetch } from "./api-client";
import type { ContentType } from "./contents";
import { DecisionError } from "./decisions";
import { formatDate } from "./format";

/** Same limits as Tambah Konten and the contents API (backend new-content.ts). */
export const MAX_NAME_LENGTH = 100;
export const MAX_BRIEF_LENGTH = 2000;

/** The days an edited deadline may take, as the admin's detail read sends them (AC 3). */
export interface EditWindow {
  earliestDeadline: string;
  latestDeadline: string;
}

/** What the rules read of a content. */
export interface EditableDetail {
  id: string;
  type: ContentType;
  name: string;
  brief: string;
  /** "YYYY-MM-DD". */
  deadline: string;
}

/** The form as typed. */
export interface EditFields {
  name: string;
  brief: string;
  deadline: string;
}

export type EditErrors = Partial<Record<keyof EditFields, string>>;

/** What PATCH /contents/:id is sent: every field the form shows (the API ignores unchanged ones). */
export type EditBody = Partial<EditFields>;

export type UpdateResult =
  | { ok: true }
  | {
      ok: false;
      /** 0 when the request never got an answer. */
      status: number;
      message: string;
      /** Field errors from a 422; empty for any other refusal. */
      errors: EditErrors;
    };

/**
 * The two calls the panel makes, injected so a test or a touchpoint can stand in for the API
 * without the panel knowing (Dependency Inversion).
 */
export interface ContentManagePorts {
  update: (id: string, body: EditBody) => Promise<UpdateResult>;
  remove: (id: string) => Promise<void>;
}

const SAVE_FAILED = "Konten gagal disimpan. Coba lagi.";
const DELETE_FAILED = "Konten gagal dihapus. Coba lagi.";
const EDIT_FIELDS: (keyof EditFields)[] = ["name", "brief", "deadline"];

/** AC 6, and AC 7 for an Evergreen item, whose quota drops by one. */
export function deleteMessage(type: ContentType): string {
  const permanent = "Konten ini akan dihapus permanen.";
  return type === "evergreen"
    ? `${permanent} Kuota Evergreen jadi kurang 1. Jadwalkan ulang lewat Tambah Konten kalau perlu.`
    : permanent;
}

export function editFieldsOf(detail: EditableDetail): EditFields {
  return { name: detail.name, brief: detail.brief, deadline: detail.deadline };
}

/**
 * AC 2, 3. A Specific item needs a name and a brief; an Evergreen item's name is the app's and
 * its brief optional. Only a deadline that moves is judged against the window, so a brief can
 * still be fixed on content whose deadline already sits inside the buffer, as the API allows.
 */
export function checkEdit(
  fields: EditFields,
  detail: EditableDetail,
  bounds: EditWindow,
): EditErrors {
  const errors: EditErrors = {};

  if (detail.type === "specific") {
    if (fields.name.trim() === "") errors.name = "Nama konten wajib diisi";
    if (fields.brief.trim() === "") errors.brief = "Brief wajib diisi";
  }

  if (fields.deadline === "") {
    errors.deadline = "Deadline wajib diisi";
  } else if (fields.deadline !== detail.deadline) {
    if (fields.deadline < bounds.earliestDeadline) {
      errors.deadline = `Deadline paling cepat ${formatDate(bounds.earliestDeadline)}`;
    } else if (fields.deadline > bounds.latestDeadline) {
      errors.deadline = `Deadline paling lambat ${formatDate(bounds.latestDeadline)} (H-5 akhir kontrak)`;
    }
  }

  return errors;
}

/** What the edit changes, as the confirmation lists it (AC 4); empty while nothing differs. */
export function editChanges(
  fields: EditFields,
  detail: EditableDetail,
): (readonly [string, string])[] {
  const changes: (readonly [string, string])[] = [];

  if (fields.deadline !== detail.deadline) {
    changes.push(["Deadline", `${formatDate(detail.deadline)} → ${formatDate(fields.deadline)}`]);
  }
  const name = fields.name.trim();
  if (detail.type === "specific" && name !== detail.name) {
    changes.push(["Nama", `${detail.name} → ${name}`]);
  }
  if (fields.brief.trim() !== detail.brief.trim()) {
    changes.push(["Brief", "diubah"]);
  }

  return changes;
}

/** Every field the form shows, trimmed; never a name for Evergreen, which the API refuses. */
export function editBody(fields: EditFields, detail: EditableDetail): EditBody {
  return {
    ...(detail.type === "specific" && { name: fields.name.trim() }),
    brief: fields.brief.trim(),
    deadline: fields.deadline,
  };
}

function contentUrl(id: string): string {
  // Encoded so a crafted id cannot climb out of /contents/ into another endpoint (OWASP A01).
  return `/api/contents/${encodeURIComponent(id)}`;
}

function errorsOf(raw: unknown): EditErrors {
  const errors: EditErrors = {};
  if (raw === null || typeof raw !== "object") return errors;
  for (const field of EDIT_FIELDS) {
    const message = (raw as Record<string, unknown>)[field];
    if (typeof message === "string") errors[field] = message;
  }
  return errors;
}

/** `PATCH /contents/:id` (AC 2-4). Never throws: every outcome is an answer the form can show. */
export async function updateContent(id: string, body: EditBody): Promise<UpdateResult> {
  let response: Response;
  try {
    response = await apiFetch(contentUrl(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, message: SAVE_FAILED, errors: {} };
  }

  if (response.ok) return { ok: true };

  // Only a 4xx carries wording written for the admin; a 5xx body may describe internals.
  const answer: { message?: unknown; errors?: unknown } | null =
    response.status < 500 ? await response.json().catch(() => null) : null;
  return {
    ok: false,
    status: response.status,
    message: typeof answer?.message === "string" ? answer.message : SAVE_FAILED,
    errors: response.status === 422 ? errorsOf(answer?.errors) : {},
  };
}

/** `DELETE /contents/:id` (AC 6-8). A refusal throws with its status, as the decisions do. */
export async function deleteContent(id: string): Promise<void> {
  const response = await apiFetch(contentUrl(id), { method: "DELETE" });

  if (!response.ok) {
    const answer: { message?: unknown } | null =
      response.status < 500 ? await response.json().catch(() => null) : null;
    throw new DecisionError(
      response.status,
      typeof answer?.message === "string" ? answer.message : DELETE_FAILED,
    );
  }
}
