// Everything the Task Saya page knows about GET /me/contents (SCRUM-102): the shape it
// answers with and how to ask for a page of it.
//
// The backend already orders the rows (open tasks by nearest deadline, then finished ones) and
// decides which buttons each row allows today, H-1 grace window included. The table renders
// `actions` as given instead of re-deriving the rules, so the list can never offer a submit
// the draft/video endpoints would refuse.

import { CONTENT_STATUS_LABELS } from "./content-labels";
import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";

/** Task Saya shows five tasks a page (PRD 3.16). */
export const MY_TASKS_PAGE_SIZE = 5;

/**
 * The statuses Task Saya filters by (PRD 3.16), matching GET /me/contents?status. A creator does
 * not tell a first hand-in from a revised one, so draft_review also covers draft_revised.
 */
export const TASK_STATUS_FILTERS = [
  "scheduled",
  "draft_review",
  "draft_revision",
  "draft_approved",
  "link_submitted",
] as const;

export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

/** How a status reads on Task Saya: the admin label, except a revised hand-in reads as in review. */
export function taskStatusLabel(status: ContentStatus): string {
  return CONTENT_STATUS_LABELS[status === "draft_revised" ? "draft_review" : status];
}

function isTaskStatusFilter(value: string): value is TaskStatusFilter {
  return (TASK_STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * The status filter the URL asks for. An unknown value lists every task instead and is handed
 * back as `invalid`, so the page can say why the filter did not apply.
 */
export function parseTaskStatus(params: Record<string, string | string[] | undefined>): {
  status: TaskStatusFilter | null;
  invalid: string | null;
} {
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  if (!raw) return { status: null, invalid: null };
  return isTaskStatusFilter(raw) ? { status: raw, invalid: null } : { status: null, invalid: raw };
}

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
  /** What the admin asked to change; set only while the row awaits a resubmit. */
  revisionNotes: string | null;
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

/** Sent when a 200 carries a body the page cannot use: the backend answered, but badly. */
const UNUSABLE_ANSWER = 502;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Just what the table relies on to render without crashing: a list of tasks, each with an
 * id for its row key and a list of actions, and numeric paging. Field values beyond that are
 * the API contract's business, not re-validated here.
 */
function isMyTasksResponse(body: unknown): body is MyTasksResponse {
  if (!isRecord(body) || !Array.isArray(body.items)) return false;

  const paging = [body.page, body.pageSize, body.total, body.totalPages];
  if (!paging.every((value) => typeof value === "number")) return false;

  return body.items.every(
    (item) => isRecord(item) && typeof item.id === "string" && Array.isArray(item.actions),
  );
}

/**
 * Server-side only: talks to the backend directly so its address never reaches the browser.
 * The request names no creator; the backend resolves whose tasks these are (OWASP A01).
 *
 * TODO(PBI-9): once Google sign-in replaces DevCreatorGuard, forward the session cookie from
 * next/headers here; until then the backend falls back to DEV_CREATOR_ID.
 */
export async function fetchMyTasks(
  page: number,
  status: TaskStatusFilter | null = null,
): Promise<MyTasksResponse> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const base = backendUrl.endsWith("/") ? backendUrl.slice(0, -1) : backendUrl;
  const query = new URLSearchParams({ page: String(page), pageSize: String(MY_TASKS_PAGE_SIZE) });
  if (status) query.set("status", status);
  const response = await fetch(`${base}/me/contents?${query}`, { cache: "no-store" });

  if (!response.ok) {
    throw new MyTasksError(response.status);
  }

  const body: unknown = await response.json();
  if (!isMyTasksResponse(body)) {
    throw new MyTasksError(UNUSABLE_ANSWER);
  }

  return body;
}
