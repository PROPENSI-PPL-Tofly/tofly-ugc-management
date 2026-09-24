// Everything the admin views know about the creators API: the shapes it returns, how a URL
// turns into a page number and filters, and the ways of asking for data. Pages never
// assemble API URLs themselves.
//
// The list is fetched on the server, this app talking to the backend directly; the detail is
// fetched in the browser through this app's own /api proxy, which keeps BACKEND_URL out of
// the browser either way.

import type { ContractType, CreatorFormErrors, CreatorFormInput } from "./creator-form";

export const PAGE_SIZE = 10;

export type ContractStatus = "active" | "expired" | "upcoming" | "none";
/** Where a content is in the review workflow, as the API reports it. */
export type ContentStatus =
  | "scheduled"
  | "draft_review"
  | "draft_revision"
  | "draft_revised"
  | "draft_approved"
  | "link_submitted";

export type Productivity = "good" | "watch" | "risk" | "no_data";
export type ContentOutcome = "on_time" | "submitted_late" | "late" | "open";

// "all" plus every value the API accepts, spelled the way the API spells them: these go
// straight into the query string, so a name that drifts from the backend is a filter that
// silently stops filtering.
export const CONTRACT_STATUS_FILTERS = ["all", "active", "expired", "upcoming", "none"] as const;
export const PRODUCTIVITY_FILTERS = ["all", "good", "watch", "risk", "no_data"] as const;

export type ContractStatusFilter = (typeof CONTRACT_STATUS_FILTERS)[number];
export type ProductivityFilter = (typeof PRODUCTIVITY_FILTERS)[number];

/** The filter state the URL carries; "all" means the filter is not applied. */
export interface CreatorFilterState {
  q: string;
  contractStatus: ContractStatusFilter;
  productivity: ProductivityFilter;
}

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
    /** The current contract's type; null without a contract. */
    type: ContractType | null;
  };
  progress: {
    submitted: number;
    total: number;
    percent: number;
  };
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

export interface CreatorDetail extends CreatorSummary {
  phoneNumber: string | null;

  contractHistory: {
    id: string;
    periodNumber: number;
    startDate: string;
    endDate: string;
    daysBetween: number;
    contentQuota: number;
    type: ContractType;
    completed: number;
    total: number;
    isCurrent: boolean;
  }[];

  contents: {
    id: string;
    name: string;
    type: string;
    deadline: string;
    status: ContentStatus;
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

function oneOf<T extends readonly string[]>(
  allowed: T,
  value: string,
  fallback: T[number],
): T[number] {
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

/**
 * The URL is the only place the page lives, so the view can be linked, bookmarked and
 * reloaded. Anything that is not a positive integer falls back to page one rather than being
 * forwarded to the API, which would only answer with a 400.
 */
export function parsePage(params: Record<string, string | string[] | undefined>): PageRequest {
  const raw = single(params.page);

  if (raw === "") {
    return {
      page: 1,
      invalid: null,
    };
  }

  return /^[1-9]\d*$/.test(raw)
    ? {
        page: Number(raw),
        invalid: null,
      }
    : {
        page: 1,
        invalid: raw,
      };
}

/**
 * Reads filter state from URL search params. Unknown values fall back to "all" so a
 * stale bookmark never breaks the page.
 */
export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): CreatorFilterState {
  return {
    q: single(params.q).trim(),
    contractStatus: oneOf(CONTRACT_STATUS_FILTERS, single(params.contractStatus), "all"),
    productivity: oneOf(PRODUCTIVITY_FILTERS, single(params.productivity), "all"),
  };
}

/** True when the listing is showing a subset, so the page can say so. */
export function hasActiveFilters(filters: CreatorFilterState): boolean {
  return (
    filters.q !== "" || filters.contractStatus !== "all" || filters.productivity !== "all"
  );
}

/** Builds a query string for the backend, omitting defaults. */
export function buildCreatorsQuery(filters: CreatorFilterState & { page: number }): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.contractStatus !== "all") query.set("contractStatus", filters.contractStatus);
  if (filters.productivity !== "all") query.set("productivity", filters.productivity);
  query.set("page", String(filters.page));
  query.set("pageSize", String(PAGE_SIZE));
  return query.toString();
}

function withoutTrailingSlash(url: string): string {
  let end = url.length;

  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }

  return url.slice(0, end);
}

/**
 * Server-side only: this app talks to the backend directly, so the address never reaches
 * the browser. BACKEND_URL is read per call because it is a plain runtime variable on the
 * deployed service; a module-scope read would freeze whatever it was at build time.
 */
export const NO_FILTERS: CreatorFilterState = {
  q: "",
  contractStatus: "all",
  productivity: "all",
};

export async function fetchCreators(
  page: number,
  filters: CreatorFilterState = NO_FILTERS,
): Promise<CreatorListResponse> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const query = buildCreatorsQuery({ ...filters, page });

  const response = await fetch(`${withoutTrailingSlash(backendUrl)}/creators?${query}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Loading creators failed with HTTP ${response.status}`);
  }

  return (await response.json()) as CreatorListResponse;
}

/**
 * Browser-side: the same-origin Next.js API proxy forwards this request to the backend.
 * Keeping the backend address out of the browser avoids exposing BACKEND_URL.
 */
export async function fetchCreatorDetail(id: string): Promise<CreatorDetail> {
  const response = await fetch(`/api/creators/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Loading creator detail failed with HTTP ${response.status}`);
  }

  return (await response.json()) as CreatorDetail;
}

/** What Add Creator sends: the form as the admin filled it, plus the deadlines it scheduled. */
export interface NewCreatorRequest extends CreatorFormInput {
  deadlines: string[];
}

export type CreateCreatorResult =
  | { ok: true }
  | { ok: false; message: string; errors: CreatorFormErrors };

const FORM_ERROR_FIELDS: (keyof CreatorFormErrors)[] = [
  "name",
  "email",
  "contractStart",
  "contractEnd",
  "interval",
  "quota",
  "fixedRate",
  "socialPlatform",
  "socialUsername",
  "deadlines",
];

/** The server's per-field messages, narrowed to text for fields the form can show them under. */
function formErrors(body: unknown): CreatorFormErrors {
  const raw = (body as { errors?: Record<string, unknown> } | null)?.errors ?? {};
  const errors: CreatorFormErrors = {};
  for (const field of FORM_ERROR_FIELDS) {
    const message = raw[field];
    if (typeof message === "string") {
      errors[field] = message;
    }
  }
  return errors;
}

/**
 * Browser-side, through the same-origin API proxy like fetchCreatorDetail. A 422 comes back as
 * the server's message per field so the modal can show each under its input; any other failure,
 * the network included, is one retryable message.
 */
export async function createCreator(request: NewCreatorRequest): Promise<CreateCreatorResult> {
  const saveFailed: CreateCreatorResult = {
    ok: false,
    message: "Creator gagal disimpan. Coba lagi.",
    errors: {},
  };

  let response: Response;
  try {
    response = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return saveFailed;
  }

  if (response.ok) {
    return { ok: true };
  }
  if (response.status !== 422) {
    return saveFailed;
  }

  const body: unknown = await response.json().catch(() => null);
  return { ok: false, message: "Data creator tidak valid", errors: formErrors(body) };
}
