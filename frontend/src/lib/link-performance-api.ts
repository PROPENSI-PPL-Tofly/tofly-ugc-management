// The calls behind a link's performance card (PBI-27, 27.5), kept out of the component. 27.1's
// PUT /contents/:id/links/:platform/performance saves an admin's numbers; 27.4's
// POST /contents/:id/performance-sync serves "Sinkronkan Sekarang".

import { apiFetch } from "./api-client";
import type { ManualErrors, ManualValues, MetricName } from "./link-performance";
import { METRICS } from "./link-performance";
import type { Platform } from "./platform-links";

const SAVE_FAILED = "Angka performa gagal disimpan. Coba lagi.";
const SYNC_FAILED = "Sinkronisasi gagal. Coba lagi.";

export type ManualSaveResult = { ok: true } | { ok: false; message: string; code?: string; errors?: ManualErrors };

export type SyncResult = { ok: true; toast: string } | { ok: false; message: string };

/** The contracts the card depends on, so a test can hand it stand-ins. */
export type ManualPerformanceSaver = (
  contentId: string,
  platform: Platform,
  values: ManualValues,
) => Promise<ManualSaveResult>;
export type ContentPerformanceSyncer = (contentId: string) => Promise<SyncResult>;

interface ErrorBody {
  message?: unknown;
  code?: unknown;
  errors?: Record<string, unknown>;
  notUpdated?: unknown;
}

async function bodyOf(response: Response): Promise<ErrorBody | null> {
  try {
    return (await response.json()) as ErrorBody;
  } catch {
    return null;
  }
}

/** Only messages for a field the form shows survive, so nothing odd lands under a field. */
function fieldErrors(errors: ErrorBody["errors"]): ManualErrors | undefined {
  if (!errors) return undefined;
  const known: (MetricName | "metrics")[] = [...METRICS.map(({ name }) => name), "metrics"];
  const problems: ManualErrors = {};
  for (const name of known) {
    if (typeof errors[name] === "string") problems[name] = errors[name];
  }
  return Object.keys(problems).length > 0 ? problems : undefined;
}

function contentPath(contentId: string): string {
  // Encoded so a crafted id cannot climb out of /contents/ into another route (OWASP A01).
  return `/api/contents/${encodeURIComponent(contentId)}`;
}

export const saveManualPerformance: ManualPerformanceSaver = async (contentId, platform, values) => {
  let response: Response;
  try {
    response = await apiFetch(`${contentPath(contentId)}/links/${platform}/performance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
  if (response.ok) return { ok: true };

  const body = await bodyOf(response);
  // A refusal the app wrote is a 422 or carries a code; anything else is not for an admin to read.
  const refusal =
    body !== null && response.status < 500 && (response.status === 422 || typeof body.code === "string");
  if (!refusal) return { ok: false, message: SAVE_FAILED };

  const failure: Extract<ManualSaveResult, { ok: false }> = {
    ok: false,
    message: typeof body.message === "string" ? body.message : SAVE_FAILED,
  };
  if (typeof body.code === "string") failure.code = body.code;
  const errors = fieldErrors(body.errors);
  if (errors) failure.errors = errors;
  return failure;
};

export const syncContentPerformance: ContentPerformanceSyncer = async (contentId) => {
  let response: Response;
  try {
    response = await apiFetch(`${contentPath(contentId)}/performance-sync`, { method: "POST" });
  } catch {
    return { ok: false, message: SYNC_FAILED };
  }

  if (response.ok) {
    const body = await bodyOf(response);
    const partial = Array.isArray(body?.notUpdated) && body.notUpdated.length > 0;
    return { ok: true, toast: partial ? "Sebagian link gagal disinkronkan" : "Data performa diperbarui" };
  }
  if (response.status === 409) {
    return { ok: false, message: "Konten ini sedang disinkronkan. Tunggu sebentar." };
  }
  // Until 27.4 lands the route is not there, which says nothing about the content itself.
  if (response.status === 404) return { ok: false, message: "Sinkronisasi otomatis belum tersedia." };
  return { ok: false, message: SYNC_FAILED };
};
