// Everything the admin views know about the creators API: the shapes it returns, how the
// page number comes out of the URL, and the one way of asking for data. Pages never
// assemble a URL themselves.

export const PAGE_SIZE = 10;

export type ContractStatus = "active" | "expired" | "upcoming" | "none";
export type Productivity = "good" | "watch" | "risk";

export interface CreatorSummary {
  id: string;
  name: string;
  email: string;
  socials: Partial<Record<"instagram" | "tiktok", string>>;
  accessRevokeDate: string | null;
  contract: {
    status: ContractStatus;
    startDate: string | null;
    endDate: string | null;
    daysRemaining: number | null;
    periodNumber: number;
    contentQuota: number;
  };
  progress: { submitted: number; total: number; percent: number };
  performance: {
    onTimeRate: number | null;
    avgRevisions: number;
    productivity: Productivity;
    productivityLabel: string;
  };
}

export interface CreatorListResponse {
  items: CreatorSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageRequest {
  page: number;
  /** The raw value when it was not a positive integer, so the page can say what it ignored. */
  invalid: string | null;
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
export function parsePage(params: Record<string, string | string[] | undefined>): PageRequest {
  const raw = single(params.page);
  if (raw === "") return { page: 1, invalid: null };

  return /^[1-9]\d*$/.test(raw)
    ? { page: Number(raw), invalid: null }
    : { page: 1, invalid: raw };
}

function withoutTrailingSlash(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}

/**
 * Server-side only: this app talks to the backend directly, so the address never reaches
 * the browser. BACKEND_URL is read per call because it is a plain runtime variable on the
 * deployed service; a module-scope read would freeze whatever it was at build time.
 */
export async function fetchCreators(page: number): Promise<CreatorListResponse> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) throw new Error("BACKEND_URL is not configured");

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  const response = await fetch(`${withoutTrailingSlash(backendUrl)}/creators?${query}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Loading creators failed with HTTP ${response.status}`);
  }
  return (await response.json()) as CreatorListResponse;
}
