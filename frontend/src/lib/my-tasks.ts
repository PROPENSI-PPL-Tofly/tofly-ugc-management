// Everything the Task Saya page knows about GET /me/contents (SCRUM-102): the shape it
// answers with and how to ask for a page of it.
//
// The backend already orders the rows (nearest deadline first, submitted links last) and
// decides which buttons each row allows today, H-1 grace window included. The table renders
// `actions` as given instead of re-deriving the rules, so the list can never offer a submit
// the draft/video endpoints would refuse.

import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";

/** Task Saya shows five tasks a page (PRD 3.16). */
export const MY_TASKS_PAGE_SIZE = 5;

export type MyTaskAction = "submit_draft" | "resubmit_draft" | "submit_video";

export interface MyTask {
  /** The id the draft and video endpoints take. */
  id: string;
  name: string;
  type: ContentType;
  brief: string;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  /** The buttons this row shows today, in display order; empty means none. */
  actions: MyTaskAction[];
}

export interface MyTasksResponse {
  items: MyTask[];
  page: number;
  pageSize: number;
  /** The creator's tasks across every page. */
  total: number;
  totalPages: number;
}

/** A failed answer from the API, keeping the status so a 401 can read differently. */
export class MyTasksError extends Error {
  constructor(readonly status: number) {
    super(`Loading my tasks failed with HTTP ${status}`);
    this.name = "MyTasksError";
  }
}

/**
 * Server-side only: talks to the backend directly so its address never reaches the browser.
 * The request names no creator; the backend resolves whose tasks these are (OWASP A01).
 */
export async function fetchMyTasks(page: number): Promise<MyTasksResponse> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const base = backendUrl.endsWith("/") ? backendUrl.slice(0, -1) : backendUrl;
  const response = await fetch(
    `${base}/me/contents?page=${page}&pageSize=${MY_TASKS_PAGE_SIZE}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new MyTasksError(response.status);
  }

  return response.json() as Promise<MyTasksResponse>;
}
