import { DEFAULT_CREATOR_DETAIL_PARAMS, type CreatorDetailParams } from "./creator-detail";
import {
  toCreatorDetailQuery,
  toCreatorDetailView,
  type RawCreatorContract,
  type RawCreatorDetail,
} from "./creator-detail-api";

const NEWEST = "33333333-3333-4333-8333-333333333333";
const MIDDLE = "22222222-2222-4222-8222-222222222222";
const OLDEST = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSES = "99999999-9999-4999-8999-999999999999";

function contract(id: string, extra: Partial<RawCreatorContract> = {}): RawCreatorContract {
  return {
    id,
    type: "regular",
    startDate: "2026-10-01",
    endDate: "2027-03-31",
    status: "active",
    fixedRate: 3300000,
    contentQuota: 6,
    remainingEvergreenQuota: 4,
    daysBetween: 14,
    contents: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 },
    ...extra,
  };
}

// GET /creators/:id as subtask 4.1 describes it (SCRUM-139): contracts newest first, each with
// one page of its content nested inside.
const RAW: RawCreatorDetail = {
  id: "creator-1",
  name: "Lestari Wulandari",
  email: "lestari@example.com",
  instagramUsername: "lestariw",
  tiktokUsername: "lestari.w",
  contracts: [
    contract(NEWEST, {
      contents: {
        items: [
          {
            id: "content-7",
            name: "Evg_1_LestariWulandari_15102026",
            type: "evergreen",
            deadline: "2026-10-15",
            status: "draft_revision",
            tags: ["overdue"],
            revisionCount: 2,
          },
        ],
        page: 2,
        pageSize: 10,
        total: 11,
        totalPages: 2,
      },
    }),
    contract(MIDDLE, {
      type: "probation",
      startDate: "2026-03-01",
      endDate: "2026-08-31",
      status: "expired",
      fixedRate: 1350000,
      contentQuota: 3,
      remainingEvergreenQuota: 0,
    }),
    contract(OLDEST, { startDate: "2025-09-01", endDate: "2026-02-28", status: "expired" }),
  ],
};

const BARE: CreatorDetailParams = DEFAULT_CREATOR_DETAIL_PARAMS;

describe("toCreatorDetailQuery", () => {
  it("asks for the first page and nothing else on the bare view", () => {
    expect(toCreatorDetailQuery(BARE).toString()).toBe("page=1");
  });

  it("names the open contract, one parameter per pick, and the page", () => {
    const query = toCreatorDetailQuery({
      contract: NEWEST,
      type: ["evergreen", "specific"],
      status: ["scheduled", "draft_review"],
      page: 3,
    });

    expect(query.get("contract")).toBe(NEWEST);
    expect(query.getAll("type")).toEqual(["evergreen", "specific"]);
    expect(query.getAll("status")).toEqual(["scheduled", "draft_review"]);
    expect(query.get("page")).toBe("3");
  });

  it("sends each pick once however often the address repeats it", () => {
    const query = toCreatorDetailQuery({
      ...BARE,
      type: ["evergreen", "evergreen"],
      status: ["scheduled", "scheduled", "pending"],
    });

    expect(query.getAll("type")).toEqual(["evergreen"]);
    expect(query.getAll("status")).toEqual(["scheduled", "pending"]);
  });
});

describe("toCreatorDetailView", () => {
  it("names the creator with the handles they have", () => {
    expect(toCreatorDetailView(RAW, BARE).creator).toEqual({
      id: "creator-1",
      name: "Lestari Wulandari",
      email: "lestari@example.com",
      socials: { instagram: "lestariw", tiktok: "lestari.w" },
    });
  });

  it.each([null, "", undefined])("leaves out a handle that arrives as %j", (missing) => {
    const raw = {
      ...RAW,
      instagramUsername: missing,
      tiktokUsername: missing,
    } as unknown as RawCreatorDetail;

    expect(toCreatorDetailView(raw, BARE).creator.socials).toEqual({});
  });

  it("lists the periods newest first, numbered from the oldest", () => {
    const { periods } = toCreatorDetailView(RAW, BARE);

    expect(periods.map((period) => [period.contractId, period.periodNumber])).toEqual([
      [NEWEST, 3],
      [MIDDLE, 2],
      [OLDEST, 1],
    ]);
  });

  it("carries each contract's own terms", () => {
    expect(toCreatorDetailView(RAW, BARE).periods[1]).toEqual({
      contractId: MIDDLE,
      periodNumber: 2,
      type: "probation",
      startDate: "2026-03-01",
      endDate: "2026-08-31",
      status: "expired",
      fixedRate: 1350000,
      contentQuota: 3,
      remainingEvergreenQuota: 0,
      daysBetween: 14,
    });
  });

  it("opens the newest contract when the address names none", () => {
    expect(toCreatorDetailView(RAW, BARE).selected?.contractId).toBe(NEWEST);
  });

  it("opens the contract the address names", () => {
    const view = toCreatorDetailView(RAW, { ...BARE, contract: MIDDLE });

    expect(view.selected?.contractId).toBe(MIDDLE);
    expect(view.selected?.periodNumber).toBe(2);
  });

  it("finds the contract whichever case the address wrote its id in", () => {
    const view = toCreatorDetailView(
      { ...RAW, contracts: [contract("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), contract(OLDEST)] },
      { ...BARE, contract: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    );

    expect(view.selected?.periodNumber).toBe(2);
  });

  it("falls back to the newest when the named contract is not this creator's", () => {
    expect(
      toCreatorDetailView(RAW, { ...BARE, contract: SOMEONE_ELSES }).selected?.contractId,
    ).toBe(NEWEST);
  });

  it("shows the open contract's rows under the page's names, with its totals", () => {
    const view = toCreatorDetailView(RAW, { ...BARE, page: 2 });

    expect(view.rows).toEqual([
      {
        contentId: "content-7",
        name: "Evg_1_LestariWulandari_15102026",
        type: "evergreen",
        deadline: "2026-10-15",
        status: "draft_revision",
        tags: ["overdue"],
        revisionCount: 2,
      },
    ]);
    expect(view.page).toBe(2);
    expect(view.total).toBe(11);
    expect(view.totalPages).toBe(2);
  });

  it("counts an empty table as one page, so its pagination has a page to stand on", () => {
    const view = toCreatorDetailView(RAW, { ...BARE, contract: MIDDLE });

    expect(view.rows).toEqual([]);
    expect(view.total).toBe(0);
    expect(view.totalPages).toBe(1);
    expect(view.page).toBe(1);
  });

  it("is a valid, empty page for a creator without any contract", () => {
    const view = toCreatorDetailView({ ...RAW, contracts: [] }, { ...BARE, contract: NEWEST });

    expect(view.periods).toEqual([]);
    expect(view.selected).toBeNull();
    expect(view.rows).toEqual([]);
    expect(view.total).toBe(0);
    expect(view.totalPages).toBe(1);
    expect(view.page).toBe(1);
  });

  it("reads a fixed rate sent as decimal text as the number it is", () => {
    const view = toCreatorDetailView(
      { ...RAW, contracts: [contract(NEWEST, { fixedRate: "1500000.00" })] },
      BARE,
    );

    expect(view.selected?.fixedRate).toBe(1500000);
  });

  it.each(["", "gratis", null, undefined, Number.NaN])(
    "has no fixed rate to show when it arrives as %j",
    (fixedRate) => {
      const view = toCreatorDetailView(
        {
          ...RAW,
          contracts: [contract(NEWEST, { fixedRate } as unknown as Partial<RawCreatorContract>)],
        },
        BARE,
      );

      expect(view.selected?.fixedRate).toBeNull();
    },
  );
});
