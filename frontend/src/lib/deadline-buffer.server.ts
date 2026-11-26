// Server-side only: the deadline buffer, read while an admin page renders so every date picker
// on it opens on the right window. It goes through backendGet, which reads the session through
// next/headers, so it stays apart from the module client code imports.

import { backendGet } from "./backend.server";
import { DEADLINE_BUFFER_PATH, DEFAULT_BUFFER_DAYS, parseBufferDays } from "./deadline-buffer";

/**
 * `GET /deadline-buffer`. A failed read keeps the pickers on the default instead of
 * taking the page down: the API still judges every deadline against the stored buffer.
 */
export async function fetchDeadlineBuffer(): Promise<number> {
  try {
    const response = await backendGet(DEADLINE_BUFFER_PATH);
    if (!response.ok) return DEFAULT_BUFFER_DAYS;
    return parseBufferDays(await response.json());
  } catch {
    return DEFAULT_BUFFER_DAYS;
  }
}
