// Everything the admin views know about the creators API: the shapes it returns, how a URL
// turns into filters, and the two ways of asking for data.
//
// The list is fetched on the server (this app talking to the backend directly) while the
// detail is fetched in the browser through this app's own /api proxy. Keeping both here
// means the pages never assemble a URL themselves.

export const CONTRACT_FILTERS = ["all", "active", "expired"] as const;
export const PRODUCTIVITY_FILTERS = ["all", "good", "watch", "risk"] as const;

export type ContractFilter = (typeof CONTRACT_FILTERS)[number];
export type ProductivityFilter = (typeof PRODUCTIVITY_FILTERS)[number];

export const PAGE_SIZE = 10;

export interface CreatorFilters {
  q: string;
  contract: ContractFilter;
  productivity: ProductivityFilter;
  page: number;
}

export type ContractStatus = "active" | "expired" | "upcoming" | "none";
export type Productivity = "good" | "watch" | "risk";
export type ContentOutcome = "on_time" | "submitted_late" | "late" | "open";

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
  stats: { total: number; active: number; good: number; risk: number };
}

export interface CreatorDetail extends CreatorSummary {
  phoneNumber: string | null;
  contractHistory: {
    id: string;
    periodNumber: number;
    startDate: string;
    endDate: string;
    daysBetween: number;
    contentQuota: number;
    completed: number;
    total: number;
    isCurrent: boolean;
  }[];
  contents: {
    id: string;
    name: string;
    type: string;
    deadline: string;
    status: string;
    outcome: ContentOutcome;
    videoLink: string | null;
  }[];
  drafts: {
    contentId: string;
    contentName: string;
    revisionCount: number;
    latestLink: string;
    lastSubmittedAt: string;
  }[];
}

/** A search parameter can arrive repeated; the first value is the one the UI set. */
function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function oneOf<T extends readonly string[]>(
  allowed: T,
  value: string,
  fallback: T[number],
): T[number] {
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

/**
 * The URL is the only place the filters live, so a page can be linked, bookmarked and
 * reloaded. Anything unrecognised falls back to the unfiltered value rather than being
 * forwarded to the API, which would only answer with a 400.
 */
export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): CreatorFilters {
  const page = Number.parseInt(single(params.page), 10);

  return {
    q: single(params.q),
    contract: oneOf(CONTRACT_FILTERS, single(params.contract), "all"),
    productivity: oneOf(PRODUCTIVITY_FILTERS, single(params.productivity), "all"),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function buildCreatorsQuery(filters: CreatorFilters): string {
  const query = new URLSearchParams();

  if (filters.q) query.set("q", filters.q);
  if (filters.contract !== "all") query.set("contract", filters.contract);
  if (filters.productivity !== "all") query.set("productivity", filters.productivity);
  if (filters.page > 1) query.set("page", String(filters.page));
  query.set("pageSize", String(PAGE_SIZE));

  return query.toString();
}

async function readJson<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${what} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Server-side only: reads BACKEND_URL per call because it is a plain runtime variable on the
 * deployed service, so a module-scope read would freeze whatever it was at build time.
 */
export async function fetchCreators(filters: CreatorFilters): Promise<CreatorListResponse> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) throw new Error("BACKEND_URL is not configured");

  const response = await fetch(
    `${backendUrl.replace(/\/+$/, "")}/creators?${buildCreatorsQuery(filters)}`,
    { cache: "no-store" },
  );

  return readJson<CreatorListResponse>(response, "Loading creators");
}

/** Browser-side: same origin, proxied on to the backend by this app. */
export async function fetchCreatorDetail(id: string): Promise<CreatorDetail> {
  const response = await fetch(`/api/creators/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  return readJson<CreatorDetail>(response, "Loading creator detail");
}
