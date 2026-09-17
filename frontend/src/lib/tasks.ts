// Everything the creator's My Task view knows about the API: the shapes it returns, how the
// page number comes out of the URL, and how the list is fetched.
//
// Which buttons are enabled is not decided here. The backend sends `actions` computed with
// the same rules its submit endpoints enforce, so the button state and the server's answer
// cannot drift apart.

import type { Tone } from "@/components/ui/pill";

/** PRD: "Paginated at 5 rows/page". */
export const TASK_PAGE_SIZE = 5;

export type ContentStatus =
  | "scheduled"
  | "draft_review"
  | "draft_revision"
  | "draft_revised"
  | "draft_approved"
  | "link_submitted";

export interface MyTask {
  id: string;
  name: string;
  type: "evergreen" | "specific";
  brief: string;
  deadline: string;
  status: ContentStatus;
  daysUntilDeadline: number;
  videoLink: string | null;
  platform: "instagram" | "tiktok" | null;
  latestDraft: {
    link: string;
    submittedAt: string;
    revisionNotes: string | null;
    revisionCount: number;
  } | null;
  actions: {
    canSubmitDraft: boolean;
    isResubmission: boolean;
    canSubmitVideo: boolean;
    inGracePeriod: boolean;
  };
}

export interface MyTaskListResponse {
  items: MyTask[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The status names the PRD uses across the admin and creator views. */
export const STATUS_LABELS: Record<ContentStatus, string> = {
  scheduled: "Scheduled",
  draft_review: "Draft Waiting for Review",
  draft_revision: "Draft Waiting for Revision",
  // Not a PRD state; nothing in My Task writes it. Labelled so it never renders blank.
  draft_revised: "Draft Revised",
  draft_approved: "Draft Approved",
  link_submitted: "Content Link Submitted",
};

export const STATUS_TONES: Record<ContentStatus, Tone> = {
  scheduled: "neutral",
  draft_review: "blue",
  draft_revision: "amber",
  draft_revised: "blue",
  draft_approved: "green",
  link_submitted: "green",
};

export const TYPE_LABELS: Record<MyTask["type"], string> = {
  evergreen: "Evergreen",
  specific: "Specific",
};

/** "H-3", "Hari ini", "Lewat 2 hari": how far the deadline is, in the words creators use. */
export function formatDeadlineDistance(days: number): string {
  if (days === 0) return "Hari ini";
  if (days < 0) return `Lewat ${Math.abs(days)} hari`;
  return `H-${days}`;
}

export function parseTaskPage(params: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Server-side only, like fetchCreators: BACKEND_URL is read per call because it is a
 * runtime variable on the deployed service.
 */
export async function fetchMyTasks(page: number): Promise<MyTaskListResponse> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) throw new Error("BACKEND_URL is not configured");

  const query = new URLSearchParams({ pageSize: String(TASK_PAGE_SIZE) });
  if (page > 1) query.set("page", String(page));

  const response = await fetch(`${backendUrl.replace(/\/+$/, "")}/me/contents?${query}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Loading tasks failed with HTTP ${response.status}`);
  return (await response.json()) as MyTaskListResponse;
}
