// Types and API client for the draft review queue (PRD 3.11).
// SSR pages call fetchSubmissionQueue with BACKEND_URL directly; the /api
// proxy keeps the backend address out of the browser.

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

export interface SubmissionQueueFilters {
  q?: string;
  status?: string;
  type?: string;
  overdue?: boolean;
}

/** A search parameter can arrive repeated; the first value is the one the UI set. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function withoutTrailingSlash(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}

/** Builds the backend query string, omitting defaults. */
export function buildSubmissionQuery(
  filters: SubmissionQueueFilters & { page: number },
): string {
  const query = new URLSearchParams();
  query.set("status", "review");
  if (filters.q) query.set("q", filters.q);
  if (filters.type && filters.type !== "all") query.set("type", filters.type);
  if (filters.status && filters.status !== "all") query.set("filterStatus", filters.status);
  if (filters.overdue) query.set("overdue", "true");
  query.set("page", String(filters.page));
  return query.toString();
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

/**
 * Server-side only: talks to the backend directly so the address never reaches
 * the browser. BACKEND_URL is read per call.
 */
export async function fetchSubmissionQueue(
  page: number,
  filters: SubmissionQueueFilters = {},
): Promise<SubmissionQueueResponse> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const query = buildSubmissionQuery({ page, ...filters });
  const response = await fetch(
    `${withoutTrailingSlash(backendUrl)}/submissions?${query}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Loading submissions failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<SubmissionQueueResponse>;
}
