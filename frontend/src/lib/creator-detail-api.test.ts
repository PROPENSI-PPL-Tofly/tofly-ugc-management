import type { RawContentList } from "./content-list-api";
import { DEFAULT_CREATOR_DETAIL_PARAMS, type CreatorDetailParams } from "./creator-detail";
import {
  openContractId,
  toCreatorContentsQuery,
  toCreatorDetailView,
  type RawCreatorDetail,
  type RawCreatorPeriod,
} from "./creator-detail-api";

const OLDEST = "11111111-1111-4111-8111-111111111111";
const MIDDLE = "22222222-2222-4222-8222-222222222222";
const NEWEST = "33333333-3333-4333-8333-333333333333";
const SOMEONE_ELSES = "99999999-9999-4999-8999-999999999999";

function period(id: string, extra: Partial<RawCreatorPeriod> = {}): RawCreatorPeriod {
  return {
    id,
    periodNumber: 3,
    type: "regular",
    startDate: "2026-10-01",
    endDate: "2027-03-31",
    status: "active",
    contentQuota: 6,
    daysBetween: 14,
    remainingEvergreenQuota: 4,
    ...extra,
  };
}

// GET /creators/:id as subtask 4.1 answers it (SCRUM-139, #91): every contract period, oldest
// first, each with its terms and the Evergreen it can still take, but none of its contents
// (#91 left those to GET /contents?contract=).
const RAW: RawCreatorDetail = {
  id: "creator-1",
  name: "Lestari Wulandari",
  email: "lestari@example.com",
  socials: { instagram: "lestariw", tiktok: "lestari.w" },
  accessRevokeDate: null,
  contractHistory: [
    period(OLDEST, {
      periodNumber: 1,
      startDate: "2025-09-01",
      endDate: "2026-02-28",
      status: "expired",
      remainingEvergreenQuota: 6,
    }),
    period(MIDDLE, {
      periodNumber: 2,
      type: "probation",
      startDate: "2026-03-01",
      endDate: "2026-08-31",
      status: "expired",
      contentQuota: 3,
      daysBetween: 7,
      remainingEvergreenQuota: 0,
    }),
    period(NEWEST),
  ],
};

// GET /contents?contract=… as subtask 5.1 answers it: one page of a period's contents.
const CONTENTS: RawContentList = {
  items: [
    {
      id: "content-7",
      name: "Evg_1_LestariWulandari_15102026",
      creatorId: "creator-1",
      creatorName: "Lestari Wulandari",
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
  tabCounts: { all: 11, needs_approval: 1, waiting_creator: 9, done: 1 },
};

const BARE: CreatorDetailParams = DEFAULT_CREATOR_DETAIL_PARAMS;

describe("openContractId", () => {
  it("is the newest contract when the address names none", () => {
    expect(openContractId(RAW, BARE)).toBe(NEWEST);
  });

  it("is the contract the address names, when it is this creator's", () => {
    expect(openContractId(RAW, { ...BARE, contract: MIDDLE })).toBe(MIDDLE);
  });

  it("finds the contract whichever case the address wrote its id in, and answers the API's own", () => {
    const lower = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const raw = { ...RAW, contractHistory: [period(lower), period(NEWEST)] };

    expect(openContractId(raw, { ...BARE, contract: lower.toUpperCase() })).toBe(lower);
  });

  it("falls back to the newest when the named contract is not this creator's", () => {
    expect(openContractId(RAW, { ...BARE, contract: SOMEONE_ELSES })).toBe(NEWEST);
  });

  it("is the creator's only contract when there is one", () => {
    expect(openContractId({ ...RAW, contractHistory: [period(OLDEST)] }, BARE)).toBe(OLDEST);
  });

  it("is nothing for a creator without any contract, whatever the address names", () => {
    const raw = { ...RAW, contractHistory: [] };

    expect(openContractId(raw, BARE)).toBeNull();
    expect(openContractId(raw, { ...BARE, contract: NEWEST })).toBeNull();
  });
});

describe("toCreatorContentsQuery", () => {
  it("asks for the first page of the contract, nearest deadline first, on the bare view", () => {
    expect(toCreatorContentsQuery(NEWEST, BARE).toString()).toBe(
      `contract=${NEWEST}&sort=deadline_asc&page=1`,
    );
  });

  // The per-creator Content Plan this page replaces listed the earliest deadline first, so what
  // is due today or overdue is on the first page. The API's own default is the latest first.
  it("always asks for the earliest deadline first, whatever the page or the filters", () => {
    const filtered = toCreatorContentsQuery(MIDDLE, {
      contract: MIDDLE,
      type: ["specific"],
      status: ["draft_review"],
      page: 4,
    });

    expect(toCreatorContentsQuery(NEWEST, BARE).getAll("sort")).toEqual(["deadline_asc"]);
    expect(filtered.getAll("sort")).toEqual(["deadline_asc"]);
  });

  it("names the contract, one parameter per pick, and the page", () => {
    const query = toCreatorContentsQuery(MIDDLE, {
      contract: MIDDLE,
      type: ["evergreen", "specific"],
      status: ["scheduled", "draft_review"],
      page: 3,
    });

    expect(query.getAll("contract")).toEqual([MIDDLE]);
    expect(query.getAll("type")).toEqual(["evergreen", "specific"]);
    expect(query.getAll("status")).toEqual(["scheduled", "draft_review"]);
    expect(query.get("page")).toBe("3");
  });

  it("asks for the contract it is handed, not the one the address named", () => {
    const query = toCreatorContentsQuery(NEWEST, { ...BARE, contract: SOMEONE_ELSES });

    expect(query.getAll("contract")).toEqual([NEWEST]);
    expect(query.toString()).not.toContain(SOMEONE_ELSES);
  });

  it("sends each pick once however often the address repeats it", () => {
    const query = toCreatorContentsQuery(NEWEST, {
      ...BARE,
      type: ["evergreen", "evergreen"],
      status: ["scheduled", "scheduled", "pending"],
    });

    expect(query.getAll("type")).toEqual(["evergreen"]);
    expect(query.getAll("status")).toEqual(["scheduled", "pending"]);
  });

  it("sends nothing else the Content Plan's own filters would: no tab and no search", () => {
    const query = toCreatorContentsQuery(NEWEST, { ...BARE, type: ["specific"], page: 2 });

    expect([...query.keys()].sort()).toEqual(["contract", "page", "sort", "type"]);
  });
});

describe("toCreatorDetailView", () => {
  it("names the creator with the accounts they have", () => {
    expect(toCreatorDetailView(RAW, CONTENTS, BARE).creator).toEqual({
      id: "creator-1",
      name: "Lestari Wulandari",
      email: "lestari@example.com",
      socials: { instagram: "lestariw", tiktok: "lestari.w" },
      accessRevokeDate: null,
    });
  });

  it("reads an answer that predates the revoke field as no revoke set", () => {
    const older = { ...RAW, accessRevokeDate: undefined } as unknown as RawCreatorDetail;

    expect(toCreatorDetailView(older, CONTENTS, BARE).creator.accessRevokeDate).toBeNull();
  });

  it("carries the day the creator's access is revoked, for the profile's Akses", () => {
    const raw = { ...RAW, accessRevokeDate: "2026-11-15" };

    expect(toCreatorDetailView(raw, CONTENTS, BARE).creator.accessRevokeDate).toBe("2026-11-15");
  });

  it.each([
    ["only Instagram", { instagram: "lestariw" }, { instagram: "lestariw" }],
    ["only TikTok", { tiktok: "lestari.w" }, { tiktok: "lestari.w" }],
    ["no account", {}, {}],
    ["an account left empty", { instagram: "", tiktok: "lestari.w" }, { tiktok: "lestari.w" }],
  ])("lists what a creator with %s has", (_, socials, shown) => {
    expect(toCreatorDetailView({ ...RAW, socials }, CONTENTS, BARE).creator.socials).toEqual(shown);
  });

  it("carries nothing but the profile's own fields, whatever else the API answers with", () => {
    const answered = {
      ...RAW,
      phoneNumber: "+62811111111",
      performance: { onTimeRate: 80 },
      contents: [],
      drafts: [],
    } as unknown as RawCreatorDetail;

    expect(Object.keys(toCreatorDetailView(answered, CONTENTS, BARE).creator).sort()).toEqual([
      "accessRevokeDate",
      "email",
      "id",
      "name",
      "socials",
    ]);
  });

  it("lists the periods newest first, under the numbers the API gave them", () => {
    const { periods } = toCreatorDetailView(RAW, CONTENTS, BARE);

    expect(periods.map((entry) => [entry.contractId, entry.periodNumber])).toEqual([
      [NEWEST, 3],
      [MIDDLE, 2],
      [OLDEST, 1],
    ]);
  });

  it("carries each contract's own terms", () => {
    expect(toCreatorDetailView(RAW, CONTENTS, BARE).periods[1]).toEqual({
      contractId: MIDDLE,
      periodNumber: 2,
      type: "probation",
      startDate: "2026-03-01",
      endDate: "2026-08-31",
      status: "expired",
      contentQuota: 3,
      evergreenCount: 3,
      remainingEvergreenQuota: 0,
      daysBetween: 7,
    });
  });

  it("reads a period as GET /creators/:id answers it today: its own numbers and no contents", () => {
    // Copied from the live answer for a creator in their second period, extra fields included.
    const answered = {
      ...RAW,
      contractHistory: [
        {
          id: NEWEST,
          periodNumber: 2,
          startDate: "2026-02-13",
          endDate: "2026-08-12",
          daysBetween: 14,
          contentQuota: 6,
          fixedRate: 400000,
          remainingEvergreenQuota: 4,
          type: "regular",
          status: "expired",
          completed: 2,
          total: 4,
          isCurrent: true,
          progress: { submitted: 2, total: 4, percent: 50 },
          performance: { onTimeRate: 0, avgRevisions: 2.33, productivity: "risk" },
        },
      ],
    } as unknown as RawCreatorDetail;

    expect(toCreatorDetailView(answered, CONTENTS, BARE).selected).toEqual({
      contractId: NEWEST,
      periodNumber: 2,
      type: "regular",
      startDate: "2026-02-13",
      endDate: "2026-08-12",
      status: "expired",
      contentQuota: 6,
      evergreenCount: 2,
      remainingEvergreenQuota: 4,
      daysBetween: 14,
    });
  });

  it.each([
    ["some of the quota is planned", 6, 4, 2, 4],
    ["none of it is planned", 6, 6, 0, 6],
    ["all of it is planned, so Tambah Konten finds Evergreen full", 3, 0, 3, 0],
    ["a quota of nothing", 0, 0, 0, 0],
    // The API never answers these, but a stray number must not open more slots than the quota
    // holds, nor count Evergreen past it.
    ["the API answers more room than the quota holds", 3, 5, 0, 3],
    ["the API answers less than no room", 3, -1, 3, 0],
  ] as const)(
    "takes the room the API leaves for Evergreen, and the Evergreen planned, when %s",
    (_, contentQuota, remainingEvergreenQuota, planned, remaining) => {
      const raw = {
        ...RAW,
        contractHistory: [period(NEWEST, { contentQuota, remainingEvergreenQuota })],
      };

      const { selected } = toCreatorDetailView(raw, CONTENTS, BARE);

      expect(selected?.evergreenCount).toBe(planned);
      expect(selected?.remainingEvergreenQuota).toBe(remaining);
    },
  );

  it("opens the newest period when the address names none", () => {
    expect(toCreatorDetailView(RAW, CONTENTS, BARE).selected?.contractId).toBe(NEWEST);
  });

  it("opens the period the address names", () => {
    const view = toCreatorDetailView(RAW, CONTENTS, { ...BARE, contract: MIDDLE });

    expect(view.selected?.contractId).toBe(MIDDLE);
    expect(view.selected?.periodNumber).toBe(2);
  });

  it("opens the newest period when the named contract is not this creator's", () => {
    const view = toCreatorDetailView(RAW, CONTENTS, { ...BARE, contract: SOMEONE_ELSES });

    expect(view.selected?.contractId).toBe(NEWEST);
  });

  it("shows the content list's rows under the page's names, with its totals", () => {
    const view = toCreatorDetailView(RAW, CONTENTS, { ...BARE, page: 2 });

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

  it("counts an empty list as one page, so the pagination has a page to stand on", () => {
    const empty: RawContentList = { ...CONTENTS, items: [], page: 1, total: 0, totalPages: 0 };
    const view = toCreatorDetailView(RAW, empty, BARE);

    expect(view.rows).toEqual([]);
    expect(view.total).toBe(0);
    expect(view.totalPages).toBe(1);
    expect(view.page).toBe(1);
  });

  // The API answers a page past the end with the number it was asked for. The pagination can
  // only name a page that exists.
  it.each([
    ["an empty period asked for page 3", 3, 0, 0, 1, 1],
    ["a one-page period asked for page 99", 99, 4, 1, 1, 1],
    ["a two-page period asked for page 5", 5, 14, 2, 2, 2],
    ["a page within the period", 2, 25, 3, 2, 3],
  ])("never names a page past the last one: %s", (_, page, total, totalPages, shown, pages) => {
    const answered: RawContentList = { ...CONTENTS, items: [], page, total, totalPages };
    const view = toCreatorDetailView(RAW, answered, BARE);

    expect(view.page).toBe(shown);
    expect(view.totalPages).toBe(pages);
  });

  it("is a valid, empty page for a creator without any contract", () => {
    const view = toCreatorDetailView({ ...RAW, contractHistory: [] }, null, {
      ...BARE,
      contract: NEWEST,
      page: 4,
    });

    expect(view.periods).toEqual([]);
    expect(view.selected).toBeNull();
    expect(view.rows).toEqual([]);
    expect(view.total).toBe(0);
    expect(view.totalPages).toBe(1);
    expect(view.page).toBe(1);
  });
});
