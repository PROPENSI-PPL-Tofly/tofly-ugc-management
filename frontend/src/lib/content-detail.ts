// Everything the Content Detail panel knows about GET /api/contents/:id (admin) and
// GET /me/contents/:id (creator): the shape the API answers with, the shape the panel
// renders, and the one function that turns the first into the second.
//
// The endpoint's event order is the contract: newest first, and this module never
// re-sorts it, so the panel and the API can never disagree about the journey.

import { apiFetch } from "./api-client";
import type { ContentType } from "./contents";
import type { ContentStatus } from "./creators";
import type { Role } from "./session";
import type { MyTaskAction } from "./my-tasks";

export type DetailEventType =
  | "scheduled"
  | "draft_submitted"
  | "revision_requested"
  | "draft_approved"
  | "link_submitted";

/** One step of the journey as the API sends it. */
export interface RawContentEvent {
  id: string;
  type: DetailEventType;
  /** ISO instant; the newest event arrives first. */
  at: string;
  actor: { name: string | null; role: "admin" | "creator" };
  payload?: { version?: number; link?: string; note?: string };
}

export interface RawContentDetail {
  id: string;
  name: string;
  type: ContentType;
  brief: string;
  /** Plain calendar day, "YYYY-MM-DD". */
  deadline: string;
  status: ContentStatus;
  creatorName: string;
  tags: { overdue: boolean; lateSubmission: boolean; approvalBypassed: boolean };
  waitingOn: "admin" | "creator" | null;
  latestSubmissionId: string | null;
  creatorActions: MyTaskAction[];
  events: RawContentEvent[];
}

export type ContentDetail = RawContentDetail;

/** A failed answer from the API, keeping the status so a 404 can read differently. */
export class ContentDetailError extends Error {
  constructor(readonly status: number) {
    super(`Loading the content detail failed with HTTP ${status}`);
    this.name = "ContentDetailError";
  }
}

/** The adapter is a pass-through today; it exists so the panel never sees the wire shape. */
export function toContentDetail(raw: RawContentDetail): ContentDetail {
  return raw;
}

/**
 * How far off the deadline reads in the header: "Selesai" once the link is in, then
 * "H-n" / "Hari ini" / "Lewat n hari" as the prototype's drawer does. ISO days compare
 * correctly as strings, and both sides are parsed as UTC so the day never shifts for
 * anyone west of Greenwich.
 */
export function dueLabel(
  status: ContentStatus,
  deadline: string,
  today: string,
): string {
  if (status === "link_submitted") {
    return "Selesai";
  }

  const day = 24 * 60 * 60 * 1000;
  const days = Math.round(
    (Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / day,
  );

  if (days > 0) return `H-${days}`;
  if (days === 0) return "Hari ini";
  return `Lewat ${-days} hari`;
}

/**
 * Where the panel's data comes from. Injected as a prop, so a touchpoint or a test can
 * swap the real HTTP loader for a stub without the panel knowing (Dependency Inversion).
 */
export type ContentDetailLoader = (
  id: string,
  role: Role,
) => Promise<ContentDetail>;

/**
 * Fetched in the browser through this app's /api proxy, which keeps BACKEND_URL out of
 * the browser. The id is encoded so a crafted value cannot climb out of /contents/ or
 * /me/contents/ into another endpoint (OWASP A01).
 */
export const fetchContentDetail: ContentDetailLoader = async (id, role) => {
  const base = role === "admin" ? "/api/contents" : "/api/me/contents";
  const response = await apiFetch(`${base}/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ContentDetailError(response.status);
  }

  return toContentDetail((await response.json()) as RawContentDetail);
};
