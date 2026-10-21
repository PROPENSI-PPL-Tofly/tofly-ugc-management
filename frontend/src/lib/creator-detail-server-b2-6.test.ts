import type { RawContentList } from "./content-list-api";
import type { RawCreatorDetail } from "./creator-detail-api";
import { DEFAULT_CREATOR_DETAIL_PARAMS, type CreatorDetailParams } from "./creator-detail";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn(async () => ({ getAll: () => [] })) }));
vi.mock("next/headers", () => ({ cookies }));

import { fetchCreatorDetail } from "./creator-detail.server";

const BACKEND = "http://localhost:3001";
const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT = "22222222-2222-4222-8222-222222222222";

const DETAIL: RawCreatorDetail = {
  id: CREATOR,
  name: "Rangga Pratama",
  email: "rangga@example.com",
  socials: { instagram: "rangga.creates" },
  accessRevokeDate: "2026-11-15",
  contractHistory: [{
    id: CONTRACT,
    periodNumber: 2,
    type: "regular",
    startDate: "2026-06-01",
    endDate: "2026-12-31",
    status: "active",
    contentQuota: 6,
    daysBetween: 14,
    remainingEvergreenQuota: 2,
    progress: { submitted: 3, total: 6, percent: 50 },
    performance: { onTimeRate: 80, avgRevisions: 1.5, productivity: "good", productivityLabel: "Baik" },
  }],
};

const CONTENTS: RawContentList = {
  items: [{
    id: "content-1",
    name: "Specific brief",
    creatorId: CREATOR,
    creatorName: "Rangga Pratama",
    type: "specific",
    deadline: "2026-10-01",
    status: "link_submitted",
    tags: ["overdue"],
    revisionCount: 0,
  }],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
  tabCounts: { all: 1, needs_approval: 0, waiting_creator: 0, done: 1 },
};

const CALENDAR: RawContentList = { ...CONTENTS, pageSize: 50 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockBackend({ calendarStatus = 200, invoiceStatus = 200 } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === `/creators/${CREATOR}`) return json(DETAIL);
    if (url.pathname === "/contents") {
      return url.searchParams.has("pageSize") ? json(CALENDAR, calendarStatus) : json(CONTENTS);
    }
    if (url.pathname === `/invoices/${CREATOR}`) {
      return json({ total: 2_500_000, floored: false, invoiceStatus: "finalized" }, invoiceStatus);
    }
    return json({}, 404);
  });
}

function urls() {
  return vi.mocked(globalThis.fetch).mock.calls.map(([input]) => new URL(String(input)));
}

describe("fetchCreatorDetail B2.6 data sources", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", BACKEND);
    mockBackend();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("loads selected-period table, calendar, counts and invoice data without mixing periods", async () => {
    const view = await fetchCreatorDetail(CREATOR, {
      ...DEFAULT_CREATOR_DETAIL_PARAMS,
      contract: CONTRACT,
      page: 2,
      tab: "done",
      q: "brief",
      overdue: "yes",
      sort: "desc",
    } as CreatorDetailParams);
    const requests = urls();
    const table = requests.find((url) => url.searchParams.get("q") === "brief");
    const calendar = requests.find((url) => url.searchParams.has("pageSize"));
    const invoice = requests.find((url) => url.pathname.startsWith("/invoices/"));
    expect(table?.searchParams.get("contract")).toBe(CONTRACT);
    expect(table?.searchParams.get("tab")).toBe("done");
    expect(table?.searchParams.get("q")).toBe("brief");
    expect(table?.searchParams.get("overdue")).toBe("true");
    expect(table?.searchParams.get("sort")).toBeNull();
    expect(calendar?.searchParams.get("contract")).toBe(CONTRACT);
    expect(calendar?.searchParams.get("pageSize")).toBe("50");
    expect(invoice?.searchParams.get("contract")).toBe(CONTRACT);
    expect(view?.calendar.map((row) => row.contentId)).toEqual(["content-1"]);
    expect(view?.counts.done).toBe(1);
    expect(view?.earnings).toEqual({ amount: 2_500_000, status: "finalized" });
  });

  it("does not hide valid creator details when only the optional invoice request fails", async () => {
    vi.restoreAllMocks();
    mockBackend({ invoiceStatus: 503 });
    const view = await fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS);
    expect(view?.rows).toHaveLength(1);
    expect(view?.calendar).toHaveLength(1);
    expect(view?.earnings).toBeNull();
  });

  it("fails the page read if a calendar page fails rather than showing a partial calendar", async () => {
    vi.restoreAllMocks();
    mockBackend({ calendarStatus: 503 });
    await expect(fetchCreatorDetail(CREATOR, DEFAULT_CREATOR_DETAIL_PARAMS)).rejects.toThrow(
      "Loading the period's calendar failed with HTTP 503",
    );
  });
});
