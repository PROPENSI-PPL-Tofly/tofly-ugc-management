import { RAW_RANGGA, RAW_RANGGA_DETAIL, RAW_UPCOMING_NO_FORMULA } from "./invoice-api.fixture";
import {
  toInvoiceBreakdown,
  toInvoiceList,
  toInvoiceListQuery,
  type RawInvoiceList,
  type RawInvoiceRow,
} from "./invoice-api";
import { DEFAULT_INVOICE_PARAMS, type InvoiceParams } from "./invoice";

const STATE: InvoiceParams = {
  q: "salsa",
  contract: "active",
  status: "paid",
  period: "all",
  from: "",
  to: "",
  sort: "total",
  order: "desc",
  page: 3,
};

/** The day the named periods are counted from, pinned so a range never moves under the test. */
const TODAY = "2026-10-18";

describe("toInvoiceListQuery", () => {
  it("sends every filter and the page, in the words the API reads", () => {
    expect(toInvoiceListQuery(STATE, TODAY).toString()).toBe(
      "q=salsa&contract=active&status=paid&sort=total&order=desc&page=3&pageSize=10",
    );
  });

  it("leaves out a filter that is not applied, and still names the page and its size", () => {
    expect(toInvoiceListQuery(DEFAULT_INVOICE_PARAMS, TODAY).toString()).toBe("page=1&pageSize=10");
  });

  it("sends a named contract-end period as the two days it stands for", () => {
    expect(toInvoiceListQuery({ ...STATE, period: "month" }, TODAY).toString()).toContain(
      "contractEndFrom=2026-10-01&contractEndTo=2026-10-31",
    );
    expect(toInvoiceListQuery({ ...STATE, period: "next30" }, TODAY).toString()).toContain(
      "contractEndFrom=2026-10-18&contractEndTo=2026-11-17",
    );
    expect(toInvoiceListQuery({ ...STATE, period: "last90" }, TODAY).toString()).toContain(
      "contractEndFrom=2026-07-20&contractEndTo=2026-10-18",
    );
  });

  it("sends a custom range as its two days, in order even when it was picked backwards", () => {
    expect(
      toInvoiceListQuery(
        { ...STATE, period: "custom", from: "2026-08-31", to: "2026-06-01" },
        TODAY,
      ).toString(),
    ).toContain("contractEndFrom=2026-06-01&contractEndTo=2026-08-31");
  });

  it("sends an open custom end as it stands, and no period at all while none is named", () => {
    expect(
      toInvoiceListQuery(
        { ...STATE, period: "custom", from: "2026-06-01", to: "" },
        TODAY,
      ).toString(),
    ).toContain("contractEndFrom=2026-06-01");
    expect(toInvoiceListQuery(STATE, TODAY).toString()).not.toContain("contractEnd");
  });
});

describe("toInvoiceList", () => {
  const RAW: RawInvoiceList = {
    items: [RAW_RANGGA],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
    summary: { total: 550000, runningInvoices: 11, formulaSet: true },
  };

  it("carries the summary of every invoice across, not only the page's", () => {
    expect(toInvoiceList(RAW).summary).toEqual({ total: 550000, runningInvoices: 11, formulaSet: true });
  });

  it("reads each component's amount into the table's columns, with the backend's total", () => {
    expect(toInvoiceList(RAW).rows).toEqual([
      {
        creatorId: RAW_RANGGA.creatorId,
        creatorName: "Rangga Pratama",
        contractId: RAW_RANGGA.contract.id,
        contractStatus: "active",
        contractEnd: RAW_RANGGA.contract.lastDay,
        fixedAmount: 500000,
        extraAmount: 200000,
        bonusAmount: null,
        penaltyAmount: 150000,
        totalAmount: 550000,
        floored: false,
        dataWaiting: false,
        pendingBonus: { amount: 150000, totalAmount: 700000, floored: false },
        periodNumber: 1,
        invoiceStatus: "accruing",
        adjustments: [],
        frozenAt: null,
      },
    ]);
  });

  it("carries the contract's id and last day, for the two invoice moves and the freeze gate", () => {
    const row = toInvoiceList(RAW).rows[0];

    expect(row.contractId).toBe(RAW_RANGGA.contract.id);
    expect(row.contractEnd).toBe(RAW_RANGGA.contract.lastDay);
  });

  it("carries which of the creator's contracts the row is, by the period it pays", () => {
    const renewal = { ...RAW_RANGGA, contract: { ...RAW_RANGGA.contract, period: 2 } };

    expect(toInvoiceList({ ...RAW, items: [renewal] }).rows[0].periodNumber).toBe(2);
  });

  // An early end stops the contract on the day access was revoked; its end date stays as agreed.
  it("gates the freeze on the day a contract that ended early stopped, not its end date", () => {
    const endedEarly = {
      ...RAW_RANGGA,
      contract: { ...RAW_RANGGA.contract, endDate: "2026-11-30", lastDay: "2026-10-05" },
    };

    expect(toInvoiceList({ ...RAW, items: [endedEarly] }).rows[0].contractEnd).toBe("2026-10-05");
  });

  it("carries each manual adjustment with its reason and the moment it was added", () => {
    const adjusted = {
      ...RAW_RANGGA,
      adjustments: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          amount: -75000,
          reason: "Koreksi kelebihan tagihan",
          actorId: "33333333-3333-4333-8333-333333333333",
          createdAt: "2026-10-18T03:00:00.000Z",
        },
      ],
    };

    expect(toInvoiceList({ ...RAW, items: [adjusted] }).rows[0].adjustments).toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        amount: -75000,
        reason: "Koreksi kelebihan tagihan",
        createdAt: "2026-10-18T03:00:00.000Z",
      },
    ]);
  });

  it("says the invoice is waiting for data while a fee or penalty is", () => {
    const waiting = {
      ...RAW_RANGGA,
      components: {
        ...RAW_RANGGA.components,
        penalty: { amount: null, status: "waiting_for_data" as const, lines: [] },
      },
    };

    expect(toInvoiceList({ ...RAW, items: [waiting] }).rows[0].dataWaiting).toBe(true);
  });

  // The bonus waits for performance data (PBI-19) and may be frozen at what was measured, once the
  // admin accepts it; it does not hold the whole invoice back.
  it("does not hold the freeze back for a bonus alone waiting for data", () => {
    expect(toInvoiceList({ ...RAW, items: [RAW_RANGGA] }).rows[0].dataWaiting).toBe(false);
  });

  it("says what freezing a pending bonus now would hold: the measured lines, added to the total", () => {
    const measuredTwice = {
      ...RAW_RANGGA,
      components: {
        ...RAW_RANGGA.components,
        performanceBonus: {
          ...RAW_RANGGA.components.performanceBonus,
          lines: [
            ...RAW_RANGGA.components.performanceBonus.lines,
            { ...RAW_RANGGA.components.performanceBonus.lines[0], contentId: "second", amount: 50000 },
          ],
        },
      },
    };

    expect(toInvoiceList({ ...RAW, items: [measuredTwice] }).rows[0].pendingBonus).toEqual({
      amount: 200000,
      totalAmount: 750000,
      floored: false,
    });
  });

  it("holds the frozen total at zero when the penalty still outweighs a pending bonus", () => {
    const outweighed = { ...RAW_RANGGA, rawTotal: -400000, total: 0, floored: true };

    expect(toInvoiceList({ ...RAW, items: [outweighed] }).rows[0].pendingBonus).toEqual({
      amount: 150000,
      totalAmount: 0,
      floored: true,
    });
  });

  it("has no pending bonus once the bonus is measured", () => {
    const measured = {
      ...RAW_RANGGA,
      components: {
        ...RAW_RANGGA.components,
        performanceBonus: { amount: 150000, status: "calculated" as const, lines: [] },
      },
    };

    expect(toInvoiceList({ ...RAW, items: [measured] }).rows[0].pendingBonus).toBeNull();
  });

  it("says nothing is waiting when every part is measured", () => {
    const measured = {
      ...RAW_RANGGA,
      components: {
        fixedRate: { amount: 500000, status: "calculated" as const, lines: [] },
        additionalContent: { amount: 200000, status: "calculated" as const, lines: [] },
        performanceBonus: { amount: 150000, status: "calculated" as const, lines: [] },
        penalty: { amount: 150000, status: "calculated" as const, lines: [] },
      },
    };

    expect(toInvoiceList({ ...RAW, items: [measured] }).rows[0].dataWaiting).toBe(false);
  });

  it("carries the moment an invoice was frozen, and nothing while it still runs", () => {
    const frozen = {
      ...RAW_RANGGA,
      invoiceStatus: "finalized" as const,
      snapshot: { finalizedAt: "2026-10-18T03:00:00.000Z" },
    };

    expect(toInvoiceList({ ...RAW, items: [frozen] }).rows[0].frozenAt).toBe(
      "2026-10-18T03:00:00.000Z",
    );
    expect(toInvoiceList(RAW).rows[0].frozenAt).toBeNull();
  });

  it("lists no adjustments and no freeze for an answer that predates them", () => {
    const old = {
      ...RAW_RANGGA,
      adjustments: undefined,
      snapshot: undefined,
    } as unknown as RawInvoiceRow;

    expect(toInvoiceList({ ...RAW, items: [old] }).rows[0]).toMatchObject({
      adjustments: [],
      frozenAt: null,
    });
  });

  it("answers in the shape the API answers in, every field named", () => {
    expect(Object.keys(RAW_RANGGA).sort()).toEqual([
      "adjustments",
      "components",
      "contract",
      "creatorId",
      "creatorName",
      "floored",
      "invoiceStatus",
      "rawTotal",
      "snapshot",
      "total",
    ]);
  });

  it("says when the penalty outweighed the pay and the total was held at zero", () => {
    const floored = { ...RAW_RANGGA, rawTotal: -100000, total: 0, floored: true };

    expect(toInvoiceList({ ...RAW, items: [floored] }).rows[0]).toMatchObject({
      totalAmount: 0,
      floored: true,
    });
  });

  it("keeps a measured bonus, a zero one included", () => {
    const measured = {
      ...RAW_RANGGA,
      components: {
        ...RAW_RANGGA.components,
        performanceBonus: { amount: 0, status: "calculated" as const, lines: [] },
      },
    };

    expect(toInvoiceList({ ...RAW, items: [measured] }).rows[0].bonusAmount).toBe(0);
  });

  it("reads a fee or penalty that waits for a formula as nothing charged yet", () => {
    const [row] = toInvoiceList({ ...RAW, items: [RAW_UPCOMING_NO_FORMULA] }).rows;

    expect(row).toMatchObject({ extraAmount: 0, penaltyAmount: 0, bonusAmount: null, totalAmount: 0 });
  });

  it("treats an empty list as one page, so the pagination has a page to name", () => {
    expect(toInvoiceList({ ...RAW, items: [], total: 0, totalPages: 0 })).toEqual({
      rows: [],
      page: 1,
      total: 0,
      totalPages: 1,
      summary: RAW.summary,
    });
  });

  it("never names a page past the last one", () => {
    expect(toInvoiceList({ ...RAW, page: 9, totalPages: 2 }).page).toBe(2);
  });
});

describe("toInvoiceBreakdown", () => {
  const breakdown = toInvoiceBreakdown(RAW_RANGGA_DETAIL);

  it("names the creator as the table does", () => {
    expect(breakdown.creatorName).toBe("Rangga Pratama");
  });

  it("shows a frozen invoice's amounts as they were frozen, never adding them up again", () => {
    // The snapshot kept a bonus the saved formula would no longer pay; the breakdown shows the
    // frozen figure and does not recompute it (12.1: the breakdown does not change after freeze).
    const frozen = {
      ...RAW_RANGGA_DETAIL,
      invoiceStatus: "finalized" as const,
      snapshot: { finalizedAt: "2026-10-18T03:00:00.000Z" },
      components: {
        ...RAW_RANGGA_DETAIL.components,
        performanceBonus: {
          amount: 999999,
          status: "calculated" as const,
          lines: [],
        },
      },
    };

    const shown = toInvoiceBreakdown(frozen);

    expect(shown.bonus.total).toBe(999999);
  });

  it("bills the fixed rate for the contract period, with the quota delivered so far", () => {
    expect(breakdown.fixed).toEqual({
      period: { number: 2, start: "2026-09-01", end: "2026-11-30", quotaDone: 4, quotaTotal: 9 },
      total: 500000,
      notStarted: false,
    });
  });

  it("lists each additional content at the fee it was paid", () => {
    expect(breakdown.extra).toEqual({
      lines: [
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000001",
          name: "Review layanan same-day",
          rate: 100000,
          amount: 100000,
          late: false,
        },
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000002",
          name: "Promo akhir bulan",
          rate: 100000,
          amount: 100000,
          late: false,
        },
      ],
      total: 200000,
    });
  });

  it("marks a Specific content handed in late, which the backend lists at Rp0", () => {
    const late = toInvoiceBreakdown({
      ...RAW_RANGGA_DETAIL,
      components: {
        ...RAW_RANGGA_DETAIL.components,
        additionalContent: {
          amount: 0,
          status: "calculated",
          lines: [{ contentId: "late-1", contentName: "Promo telat", amount: 0, basis: { fee: 100000, late: "yes" } }],
        },
      },
    });

    expect(late.extra.lines).toEqual([
      { contentId: "late-1", name: "Promo telat", rate: 100000, amount: 0, late: true },
    ]);
  });

  it("lists the bonuses known so far, says the rest is waiting, and states the formula's rules", () => {
    expect(breakdown.bonus).toEqual({
      lines: [
        {
          kind: "performance",
          contentId: "a1a1a1a1-0000-4000-8000-000000000003",
          name: "Unboxing Kelas TOEFL",
          platform: "instagram",
          metric: "views",
          value: 12400,
          tier: 1,
          amount: 150000,
        },
      ],
      total: 0,
      performance: "waiting",
      rules: {
        tiers: [
          {
            platform: "instagram",
            metric: "views",
            steps: [
              { min: 50000, bonus: 150000 },
              { min: 10000, bonus: 50000 },
            ],
          },
          { platform: "tiktok", metric: "likes", steps: [{ min: 1000, bonus: 50000 }] },
        ],
        specificBonus: 100000,
      },
    });
  });

  it("lists each late content with the days it was late and the days charged", () => {
    expect(breakdown.penalty).toEqual({
      lines: [
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000004",
          name: "Cara lacak paket",
          daysLate: 5,
          chargedDays: 3,
          ratePerDay: 50000,
          amount: 150000,
          ongoing: false,
        },
      ],
      total: 150000,
    });
  });

  describe("a penalty still counting", () => {
    const withLine = (
      basis: Record<string, number | string>,
      status: "active" | "expired" = "active",
    ) =>
      toInvoiceBreakdown({
        ...RAW_RANGGA_DETAIL,
        contract: { ...RAW_RANGGA_DETAIL.contract, status },
        components: {
          ...RAW_RANGGA_DETAIL.components,
          penalty: {
            amount: 50000,
            status: "calculated",
            lines: [{ contentId: "late", contentName: "Late", amount: 50000, basis }],
          },
        },
      }).penalty.lines[0].ongoing;

    it("is ongoing while the content is not in and the cap is not reached", () => {
      expect(withLine({ daysLate: 1, chargedDays: 1, perDay: 50000, handedIn: "no" })).toBe(true);
    });

    it("stops once the cap is reached, once the content is in, or once the contract is over", () => {
      expect(withLine({ daysLate: 3, chargedDays: 3, perDay: 50000, handedIn: "no" })).toBe(false);
      expect(withLine({ daysLate: 1, chargedDays: 1, perDay: 50000, handedIn: "yes" })).toBe(false);
      expect(
        withLine({ daysLate: 1, chargedDays: 1, perDay: 50000, handedIn: "no" }, "expired"),
      ).toBe(false);
    });
  });

  it("reads a contract that has not started, with no formula saved, as nothing billed or stated yet", () => {
    expect(toInvoiceBreakdown(RAW_UPCOMING_NO_FORMULA)).toEqual({
      creatorName: "Farah Nur Aini",
      fixed: {
        period: { number: 1, start: "2026-11-01", end: "2027-01-31", quotaDone: 0, quotaTotal: 3 },
        total: 0,
        notStarted: true,
      },
      extra: { lines: [], total: 0 },
      bonus: {
        lines: [],
        total: 0,
        performance: "waiting",
        rules: { tiers: [], specificBonus: 0 },
      },
      penalty: { lines: [], total: 0 },
    });
  });

  it("reads a basis value that is missing or not a number as zero rather than NaN", () => {
    const odd = toInvoiceBreakdown({
      ...RAW_RANGGA_DETAIL,
      components: {
        ...RAW_RANGGA_DETAIL.components,
        fixedRate: {
          amount: 500000,
          status: "calculated",
          lines: [{ contentId: "c", contentName: "Kontrak", amount: 500000, basis: { delivered: "x" } }],
        },
      },
    });

    expect(odd.fixed.period).toMatchObject({ quotaDone: 0, quotaTotal: 0 });
  });

  it("reads a measured bonus as ready, at the amount the backend totalled", () => {
    const measured = toInvoiceBreakdown({
      ...RAW_RANGGA_DETAIL,
      components: {
        ...RAW_RANGGA_DETAIL.components,
        performanceBonus: { ...RAW_RANGGA_DETAIL.components.performanceBonus, amount: 150000, status: "calculated" },
      },
    });

    expect(measured.bonus).toMatchObject({ total: 150000, performance: "ready" });
  });

  it("reads any component left without an amount as nothing billed yet, in the table and the popup", () => {
    const fixedRate = { amount: null, status: "waiting_for_data" as const, lines: [] };
    const waiting = { ...RAW_RANGGA_DETAIL, components: { ...RAW_RANGGA_DETAIL.components, fixedRate } };

    expect(toInvoiceBreakdown(waiting).fixed.total).toBe(0);
    expect(
      toInvoiceList({
        items: [waiting],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        summary: { total: 0, runningInvoices: 1, formulaSet: true },
      }).rows[0]
        .fixedAmount,
    ).toBe(0);
  });

  it("reads a fixed rate with no line at all as nothing delivered of no quota", () => {
    const bare = toInvoiceBreakdown({
      ...RAW_RANGGA_DETAIL,
      components: {
        ...RAW_RANGGA_DETAIL.components,
        fixedRate: { amount: 0, status: "calculated", lines: [] },
      },
    });

    expect(bare.fixed.period).toMatchObject({ quotaDone: 0, quotaTotal: 0 });
  });
});
