import type { RawContentList } from "./content-list-api";
import { DEFAULT_CREATOR_DETAIL_PARAMS, type CreatorDetailParams } from "./creator-detail";
import {
  openContractId,
  toCreatorCalendarQuery,
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
    fixedRate: 2_500_000,
    remainingEvergreenQuota: 4,
    progress: { submitted: 0, total: 6, percent: 0 },
    performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
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
      fixedRate: 1_000_000,
      remainingEvergreenQuota: 0,
    }),
    period(NEWEST),
  ],
};

// GET /contents?contract=… as subtask 5.1 answers it: one page of a period's contents.
const CONTENTS: RawContentList = {
  items: [
    {
      platforms: [],
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
  // PBI-30 display: the switcher selects the active period first, the next Belum Dimulai
  // second, and the most recent as the last resort (AC 2).
  it("is the active contract when the address names none", () => {
    // RAW has NEWEST as active; the old behaviour also picked it, so this passes either way.
    expect(openContractId(RAW, BARE)).toBe(NEWEST);
  });

  it("prefers the active period even when a newer one has not started yet", () => {
    const raw = {
      ...RAW,
      contractHistory: [
        period(OLDEST, { periodNumber: 1, status: "expired" }),
        period(MIDDLE, { periodNumber: 2, status: "active" }),
        period(NEWEST, { periodNumber: 3, status: "upcoming", startDate: "2027-01-01" }),
      ],
    };

    expect(openContractId(raw, BARE)).toBe(MIDDLE);
  });

  it("picks the next Belum Dimulai period when none is active", () => {
    const raw = {
      ...RAW,
      contractHistory: [
        period(OLDEST, { periodNumber: 1, status: "expired" }),
        period(MIDDLE, { periodNumber: 2, status: "upcoming", startDate: "2026-12-01" }),
        period(NEWEST, { periodNumber: 3, status: "upcoming", startDate: "2027-06-01" }),
      ],
    };

    expect(openContractId(raw, BARE)).toBe(MIDDLE);
  });

  it("falls back to the most recent period when none is active or upcoming", () => {
    const raw = {
      ...RAW,
      contractHistory: [
        period(OLDEST, { periodNumber: 1, status: "expired" }),
        period(MIDDLE, { periodNumber: 2, status: "expired" }),
      ],
    };

    expect(openContractId(raw, BARE)).toBe(MIDDLE);
  });

  it("is the contract the address names, when it is this creator's", () => {
    expect(openContractId(RAW, { ...BARE, contract: MIDDLE })).toBe(MIDDLE);
  });

  it("finds the contract whichever case the address wrote its id in, and answers the API's own", () => {
    const lower = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const raw = { ...RAW, contractHistory: [period(lower), period(NEWEST)] };

    expect(openContractId(raw, { ...BARE, contract: lower.toUpperCase() })).toBe(lower);
  });

  it("falls back to the active period when the named contract is not this creator's", () => {
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
      ...BARE,
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
      ...BARE,
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

describe("toCreatorCalendarQuery", () => {
  it("asks for the contract's contents in deadline order, one page at a time", () => {
    const query = toCreatorCalendarQuery(NEWEST, 2);

    expect(query.get("contract")).toBe(NEWEST);
    expect(query.get("sort")).toBe("deadline_asc");
    expect(query.get("pageSize")).toBe("50");
    expect(query.get("page")).toBe("2");
  });

  it("sends no filters beyond the contract, the sort and the page", () => {
    const query = toCreatorCalendarQuery(MIDDLE, 1);

    expect([...query.keys()].sort()).toEqual(["contract", "page", "pageSize", "sort"]);
  });
});

describe("toCreatorDetailView", () => {
  describe("current", () => {
    // A renewal waiting to start is the newest period, but the running one is still current.
    const RENEWED: RawCreatorDetail = {
      ...RAW,
      contractHistory: [
        period(MIDDLE, { periodNumber: 1, type: "probation", status: "active", isCurrent: true }),
        period(NEWEST, { periodNumber: 2, status: "upcoming", startDate: "2027-05-10", isCurrent: false }),
      ],
    };

    it("is the period the API marks current, not the newest one", () => {
      const view = toCreatorDetailView(RENEWED, CONTENTS, BARE);

      expect(view.current?.contractId).toBe(MIDDLE);
      expect(view.current?.status).toBe("active");
      expect(view.current?.type).toBe("probation");
    });

    it("stays the current period whichever period the address opens", () => {
      expect(toCreatorDetailView(RENEWED, CONTENTS, { ...BARE, contract: NEWEST }).current?.contractId).toBe(MIDDLE);
    });

    it("is the active period when the API marks none", () => {
      const raw: RawCreatorDetail = {
        ...RAW,
        contractHistory: [
          period(MIDDLE, { periodNumber: 1, status: "active" }),
          period(NEWEST, { periodNumber: 2, status: "upcoming" }),
        ],
      };

      expect(toCreatorDetailView(raw, CONTENTS, BARE).current?.contractId).toBe(MIDDLE);
    });

    it("is the newest period when none is marked or active", () => {
      expect(toCreatorDetailView(RAW, CONTENTS, BARE).current?.contractId).toBe(NEWEST);
    });

    it("is nothing for a creator without a contract", () => {
      expect(toCreatorDetailView({ ...RAW, contractHistory: [] }, null, BARE).current).toBeNull();
    });
  });

  it("names the creator with the accounts they have", () => {
    expect(toCreatorDetailView(RAW, CONTENTS, BARE).creator).toEqual({
      id: "creator-1",
      name: "Lestari Wulandari",
      email: "lestari@example.com",
      socials: { instagram: "lestariw", tiktok: "lestari.w" },
      accessRevokeDate: null,
    });
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
      accessRevokeDate: null,
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
      // Perpanjang Kontrak opens with the previous period's rate (PBI-30 AC 2).
      fixedRate: 1_000_000,
      earlyEndReason: null,
      progress: { submitted: 0, total: 6, percent: 0 },
      performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
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
          performance: { onTimeRate: 0, avgRevisions: 2.33, productivity: "risk", productivityLabel: "Berisiko" },
        },
      ],
    } as unknown as RawCreatorDetail;

    // The period's own progress, performance and fixed rate are carried for Creator Detail to
    // show; the counts the progress already holds are not.
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
      fixedRate: 400000,
      earlyEndReason: null,
      progress: { submitted: 2, total: 4, percent: 50 },
      performance: { onTimeRate: 0, avgRevisions: 2.33, productivity: "risk", productivityLabel: "Berisiko" },
    });
  });

  // PBI-37 ends a contract early for a reason; PBI-30 AC 3 warns about it on renewal.
  it.each([
    ["Pelanggaran Kontrak", "violation"],
    ["Fraud", "fraud"],
    ["Lainnya", "other"],
  ] as const)("reads a contract ended early for %s", (_label, earlyEndReason) => {
    const raw = { ...RAW, contractHistory: [period(NEWEST, { earlyEndReason })] };

    expect(toCreatorDetailView(raw, CONTENTS, BARE).selected?.earlyEndReason).toBe(earlyEndReason);
  });

  it.each([
    ["not sent, as before PBI-37", undefined],
    ["null for a contract not ended early", null],
    ["a reason from another world", "bored"],
  ])("reads no early end when the reason is %s", (_label, earlyEndReason) => {
    const raw = {
      ...RAW,
      contractHistory: [period(NEWEST, { earlyEndReason } as unknown as Partial<RawCreatorPeriod>)],
    };

    expect(toCreatorDetailView(raw, CONTENTS, BARE).selected?.earlyEndReason).toBeNull();
  });

  // PBI-37, 37.3: the period's early end as GET /creators/:id sends it (37.1), for the label,
  // the original end and the reason. The admin's note and the moment stay out of the view.
  it("reads a period's early end, keeping only what the page shows", () => {
    const raw = {
      ...RAW,
      contractHistory: [
        period(NEWEST, {
          endDate: "2026-11-20",
          earlyEndReason: "fraud",
          earlyEnd: {
            originalEndDate: "2026-12-31",
            reason: "fraud",
            note: "Akun palsu",
            endedAt: "2026-11-20T03:00:00.000Z",
          },
        }),
      ],
    };

    expect(toCreatorDetailView(raw, CONTENTS, BARE).selected?.earlyEnd).toEqual({
      originalEndDate: "2026-12-31",
      reason: "fraud",
    });
  });

  // OWASP A06 and A10: no earlyEnd, or a broken one, is a period that runs as agreed.
  it.each([
    ["not sent, as before PBI-37", undefined],
    ["null for a contract not ended early", null],
    ["broken", { reason: "fraud" }],
  ])("reads no early end on a period when earlyEnd is %s", (_label, earlyEnd) => {
    const raw = {
      ...RAW,
      contractHistory: [period(NEWEST, { earlyEnd } as unknown as Partial<RawCreatorPeriod>)],
    };

    expect(toCreatorDetailView(raw, CONTENTS, BARE).selected?.earlyEnd).toBeUndefined();
  });

  // The invoice card's Total Pendapatan: a floored total is one the penalties ate, so Rp0.
  it.each([
    ["the invoice's total", false, 3_000_000],
    ["nothing when the penalties floored the total", true, 0],
  ])("reads the period's earnings as %s", (_label, floored, amount) => {
    const view = toCreatorDetailView(RAW, CONTENTS, BARE, [], { total: 3_000_000, floored, invoiceStatus: "accruing" });

    expect(view.earnings).toEqual({ amount, status: "accruing" });
  });

  it("keeps each period's own measurements apart", () => {
    const answered = {
      ...RAW,
      contractHistory: [
        period(OLDEST, {
          progress: { submitted: 3, total: 3, percent: 100 },
          performance: { onTimeRate: 100, avgRevisions: 0, productivity: "good", productivityLabel: "Baik" },
        }),
        period(NEWEST, {
          progress: { submitted: 1, total: 6, percent: 17 },
          performance: { onTimeRate: 50, avgRevisions: 3, productivity: "risk", productivityLabel: "Berisiko" },
        }),
      ],
    } as RawCreatorDetail;

    const [newest, oldest] = toCreatorDetailView(answered, CONTENTS, BARE).periods;

    expect(newest.performance?.onTimeRate).toBe(50);
    expect(newest.progress?.submitted).toBe(1);
    expect(oldest.performance?.productivityLabel).toBe("Baik");
    expect(oldest.progress?.percent).toBe(100);
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

  it("opens the active period when the address names none", () => {
    // RAW's NEWEST is active, so the active period is the newest here.
    expect(toCreatorDetailView(RAW, CONTENTS, BARE).selected?.contractId).toBe(NEWEST);
  });

  it("opens the period the address names", () => {
    const view = toCreatorDetailView(RAW, CONTENTS, { ...BARE, contract: MIDDLE });

    expect(view.selected?.contractId).toBe(MIDDLE);
    expect(view.selected?.periodNumber).toBe(2);
  });

  it("opens the active period when the named contract is not this creator's", () => {
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
        platforms: [],
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

  it("carries the period's earnings and invoice status when the invoice is known", () => {
    const invoice = { total: 2_500_000, floored: false, invoiceStatus: "finalized" as const };
    const view = toCreatorDetailView(RAW, CONTENTS, BARE, [], invoice);

    expect(view.earnings).toEqual({ amount: 2_500_000, status: "finalized" });
  });

  it("holds the earnings at zero when the penalty floored the total", () => {
    const invoice = { total: 500_000, floored: true, invoiceStatus: "paid" as const };
    const view = toCreatorDetailView(RAW, CONTENTS, BARE, [], invoice);

    expect(view.earnings).toEqual({ amount: 0, status: "paid" });
  });

  it("carries no earnings when the invoice endpoint was unavailable", () => {
    const view = toCreatorDetailView(RAW, CONTENTS, BARE, [], null);

    expect(view.earnings).toBeNull();
  });
});

// PBI-19, AC 12: the profile's connection badges, read through the one adapter for them.
describe("toCreatorDetailView connections", () => {
  it("reads each account's connection from the creator's answer", () => {
    const raw = {
      ...RAW,
      socialConnections: {
        instagram: { connected: true, connectedAt: "2026-10-29T10:00:00Z", lastSyncAt: null },
      },
    };

    expect(toCreatorDetailView(raw, CONTENTS, BARE).connections).toEqual({
      instagram: { connected: true, connectedAt: "2026-10-29T10:00:00Z", lastSyncAt: null },
      tiktok: { connected: false, connectedAt: null, lastSyncAt: null },
    });
  });

  it("reads every account as not connected while the answer has no connections", () => {
    expect(toCreatorDetailView(RAW, CONTENTS, BARE).connections).toEqual({
      instagram: { connected: false, connectedAt: null, lastSyncAt: null },
      tiktok: { connected: false, connectedAt: null, lastSyncAt: null },
    });
  });
});

// PBI-16: what Ubah Data reads of the creator and their periods.
describe("toCreatorDetailView for Ubah Data", () => {
  const view = (raw: Partial<RawCreatorDetail>) =>
    toCreatorDetailView({ ...RAW, ...raw }, null, DEFAULT_CREATOR_DETAIL_PARAMS);

  it("carries each period's invoice status and true Evergreen count", () => {
    const [period_] = view({
      contractHistory: [period(NEWEST, { evergreenCount: 9, invoiceStatus: "finalized" })],
    }).periods;

    // The count may pass the quota; evergreenCount stays within it for Tambah Konten.
    expect(period_).toMatchObject({ evergreenPlanned: 9, invoiceStatus: "finalized", evergreenCount: 2 });
  });

  it("carries the server's username locks, or the connection's on an older answer", () => {
    expect(view({ usernameLocks: { instagram: "link_submitted", tiktok: null } }).usernameLocks).toEqual({
      instagram: "link_submitted",
      tiktok: null,
    });
    expect(view({ socialConnections: { tiktok: { connected: true } } }).usernameLocks).toEqual({
      instagram: null,
      tiktok: "connected",
    });
  });
});

describe("a content an early end closed", () => {
  it("keeps the moment it was closed on the row, and null on one still open", () => {
    const closed = { ...CONTENTS.items[0], status: "scheduled" as const, closedAt: "2026-11-20T03:00:00.000Z" };
    const view = toCreatorDetailView(RAW, { ...CONTENTS, items: [closed, CONTENTS.items[0]] }, BARE);

    expect(view.rows.map((row) => row.closedAt)).toEqual(["2026-11-20T03:00:00.000Z", null]);
  });
});
