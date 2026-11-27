// The one deadline buffer a Super Admin sets in "Atur Buffer Deadline" (PBI-23, 23.9). It draws
// both lines every date picker holds: no deadline earlier than the buffer after max(today,
// contract start), and none later than the contract end minus the buffer (the H-n line).
// Pure rules and the browser-side save live here; the server-side read is in
// deadline-buffer.server.ts, because it reads the session through next/headers.

import { apiFetch } from "./api-client";

/** The limits and the default the API holds (PBI-23 AC: 1–14 days, 5 until changed). */
export const MIN_BUFFER_DAYS = 1;
export const MAX_BUFFER_DAYS = 14;
export const DEFAULT_BUFFER_DAYS = 5;

/** Where the setting lives (23.8, SCRUM-298): GET for every Admin and creator, PUT for a Super Admin. */
export const DEADLINE_BUFFER_PATH = "/deadline-buffer";

export type SaveBufferResult =
  | { ok: true; bufferDays: number }
  | {
      ok: false;
      /** 0 when the request never got an answer. */
      status: number;
      message: string;
      /** The API's message about the field itself, from a 422. */
      fieldError?: string;
    };

/** The save the modal calls, injected so a test can stand in for the API. */
export type BufferSaver = (bufferDays: number) => Promise<SaveBufferResult>;

const SAVE_FAILED = "Buffer deadline gagal disimpan. Coba lagi.";
const SUPER_ADMIN_ONLY = "Hanya Super Admin yang bisa mengubah buffer deadline.";

function inRange(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_BUFFER_DAYS && value <= MAX_BUFFER_DAYS;
}

// The API's own words for the field (backend deadline-buffer-input.ts), so the form and a 422
// never say the same thing two ways.
const BUFFER_EMPTY = "Isi buffer deadline";
const BUFFER_OUT_OF_RANGE = `Isi angka bulat ${MIN_BUFFER_DAYS}–${MAX_BUFFER_DAYS}`;

/** What is wrong with the typed buffer, in the words the API uses, or undefined when it fits. */
export function checkBufferDays(typed: string): string | undefined {
  const value = typed.trim();
  if (value === "") return BUFFER_EMPTY;
  if (!/^\d+$/.test(value) || !inRange(Number(value))) return BUFFER_OUT_OF_RANGE;
  return undefined;
}

/** The confirmation's one line: what the buffer was and what it becomes. */
export function bufferChangeDetails(current: number, next: number): (readonly [string, string])[] {
  return [["Buffer deadline", `${current} hari → ${next} hari`]];
}

/**
 * The buffer out of the API's answer, `{ bufferDays, min, max }`. Anything outside the limits
 * is not trusted: the pickers fall back to the default rather than draw a window the API would
 * never hold.
 */
export function parseBufferDays(raw: unknown): number {
  const value = (raw as { bufferDays?: unknown } | null)?.bufferDays;
  return typeof value === "number" && inRange(value) ? value : DEFAULT_BUFFER_DAYS;
}

/** `PUT /deadline-buffer`, Super Admin only. Never throws: every outcome is an answer. */
export async function saveDeadlineBuffer(bufferDays: number): Promise<SaveBufferResult> {
  let response: Response;
  try {
    response = await apiFetch(`/api${DEADLINE_BUFFER_PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bufferDays }),
    });
  } catch {
    return { ok: false, status: 0, message: SAVE_FAILED };
  }

  if (response.ok) {
    return { ok: true, bufferDays: parseBufferDays(await response.json().catch(() => null)) };
  }
  if (response.status === 403) {
    return { ok: false, status: 403, message: SUPER_ADMIN_ONLY };
  }

  // Only a 4xx carries wording written for the admin; a 5xx body may describe internals.
  const answer: { message?: unknown; errors?: { bufferDays?: unknown } } | null =
    response.status < 500 ? await response.json().catch(() => null) : null;
  const fieldError = answer?.errors?.bufferDays;
  return {
    ok: false,
    status: response.status,
    message: typeof answer?.message === "string" ? answer.message : SAVE_FAILED,
    ...(typeof fieldError === "string" && { fieldError }),
  };
}
