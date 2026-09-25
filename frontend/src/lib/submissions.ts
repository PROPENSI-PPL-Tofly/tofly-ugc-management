// Types and API client for the draft review queue (PRD 3.11).
// The browser-side fetch goes through the same-origin /api proxy, keeping
// BACKEND_URL out of the browser.

export interface SubmissionQueueItem {
  submissionId: string;
  creatorName: string;
  contentName: string;
  type: string;
  deadline: string;
  status: "draft_review" | "draft_revised";
}

export interface SubmissionQueueResponse {
  items: SubmissionQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** A search parameter can arrive repeated; the first value is the one the UI set. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * The URL is the only place the page lives, so the view can be linked, bookmarked and
 * reloaded. Anything that is not a positive integer falls back to page one rather than being
 * forwarded to the API, which would only answer with a 400.
 */
export function parseSubmissionPage(
  params: Record<string, string | string[] | undefined>,
): { page: number; invalid: string | null } {
  const raw = single(params.page);

  if (raw === "") {
    return { page: 1, invalid: null };
  }

  return /^[1-9]\d*$/.test(raw)
    ? { page: Number(raw), invalid: null }
    : { page: 1, invalid: raw };
}

export async function fetchSubmissionQueue(
  page: number,
): Promise<SubmissionQueueResponse> {
  const response = await fetch(
    `/api/submissions?status=review&page=${page}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Loading submissions failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<SubmissionQueueResponse>;
}
