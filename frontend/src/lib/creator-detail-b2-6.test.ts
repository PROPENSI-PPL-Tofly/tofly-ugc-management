import { DEFAULT_CREATOR_DETAIL_PARAMS, parseCreatorDetailParams } from "./creator-detail";
import { toCreatorContentsQuery, toCreatorDetailView, type RawCreatorDetail, type RawCreatorPeriod } from "./creator-detail-api";
import type { RawContentList } from "./content-list-api";

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT = "22222222-2222-4222-8222-222222222222";
const METRICS = {
  progress: { submitted: 3, total: 6, percent: 50 },
  performance: { onTimeRate: 80, avgRevisions: 1.5, productivity: "good" as const, productivityLabel: "Baik" },
};

const PERIOD = {
  id: CONTRACT,
  periodNumber: 2,
  type: "regular",
  startDate: "2026-06-01",
  endDate: "2026-12-31",
  status: "active",
  contentQuota: 6,
  daysBetween: 14,
  remainingEvergreenQuota: 2,
  ...METRICS,
} as RawCreatorPeriod;

const RAW: RawCreatorDetail = {
  id: CREATOR,
  name: "Rangga Pratama",
  email: "rangga@example.com",
  socials: { instagram: "rangga.creates" },
  accessRevokeDate: null,
  contractHistory: [PERIOD],
};

const CONTENTS: RawContentList = {
  items: [{
    id: "content-1",
    name: "Evg_1_Rangga_2026",
    creatorId: CREATOR,
    creatorName: "Rangga Pratama",
    type: "evergreen",
    deadline: "2026-10-01",
    status: "scheduled",
    tags: [],
    revisionCount: 0,
  }],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
  tabCounts: { all: 1, needs_approval: 0, waiting_creator: 1, done: 0 },
};

describe("Creator Detail's Content Plan query adapter", () => {
  it("translates tab, search, type, status, overdue, sort and page using the shared API vocabulary", () => {
    const state = parseCreatorDetailParams({
      contract: CONTRACT,
      tab: "done",
      q: "Kopi",
      type: "specific",
      status: "link_submitted",
      overdue: "yes",
      sort: "desc",
      page: "2",
    });
    const query = toCreatorContentsQuery(CONTRACT, state, "2026-10-21");
    expect(query.get("contract")).toBe(CONTRACT);
    expect(query.get("tab")).toBe("done");
    expect(query.get("q")).toBe("Kopi");
    expect(query.getAll("type")).toEqual(["specific"]);
    expect(query.getAll("status")).toEqual(["link_submitted"]);
    expect(query.get("overdue")).toBe("true");
    // Content Plan's API default is deadline_desc, so the shared adapter omits it.
    expect(query.get("sort")).toBeNull();
    expect(query.get("page")).toBe("2");
  });

  it("keeps invalid URL values out of the backend request", () => {
    const state = parseCreatorDetailParams({ tab: "<script>", q: "  " + "x".repeat(200), overdue: "maybe", sort: "sideways" });
    const query = toCreatorContentsQuery(CONTRACT, state, "2026-10-21");
    expect(query.get("tab")).toBeNull();
    expect(query.get("overdue")).toBeNull();
    expect(query.get("q")).toBe("x".repeat(100));
    expect(query.get("sort")).toBe("deadline_asc");
  });

  it("maps the authoritative period metrics, access date, tab counts, calendar entries and invoice", () => {
    const calendar = [{ ...CONTENTS.items[0], id: "content-calendar", deadline: "2026-11-05" }];
    const view = toCreatorDetailView(
      RAW,
      CONTENTS,
      DEFAULT_CREATOR_DETAIL_PARAMS,
      calendar,
      { total: 2_500_000, floored: false, invoiceStatus: "finalized" },
    );
    expect(view.selected).toMatchObject(METRICS);
    expect(view.creator.accessRevokeDate).toBeNull();
    expect(view.counts).toEqual({ all: 1, action: 0, waiting: 1, done: 0 });
    expect(view.calendar.map((item) => item.contentId)).toEqual(["content-calendar"]);
    expect(view.earnings).toEqual({ amount: 2_500_000, status: "finalized" });
  });

  it("keeps a finished late hand-in in the done count", () => {
    const done = {
      ...CONTENTS,
      items: [{ ...CONTENTS.items[0], status: "link_submitted" as const, tags: ["overdue" as const] }],
      tabCounts: { all: 1, needs_approval: 0, waiting_creator: 0, done: 1 },
    };
    const view = toCreatorDetailView(RAW, done, { ...DEFAULT_CREATOR_DETAIL_PARAMS, tab: "done" });
    expect(view.counts.done).toBe(1);
    expect(view.rows[0].status).toBe("link_submitted");
  });
});
