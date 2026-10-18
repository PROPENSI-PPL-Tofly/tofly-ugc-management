import { RAW_RANGGA, RAW_RANGGA_DETAIL, RAW_UPCOMING_NO_FORMULA } from "./invoice-api.fixture";
import {
  toInvoiceBreakdown,
  toInvoiceList,
  toInvoiceListQuery,
  type RawInvoiceList,
} from "./invoice-api";
import { DEFAULT_INVOICE_PARAMS, type InvoiceParams } from "./invoice";

const STATE: InvoiceParams = { q: "salsa", contract: "active", status: "paid", page: 3 };

describe("toInvoiceListQuery", () => {
  it("sends every filter and the page, in the words the API reads", () => {
    expect(toInvoiceListQuery(STATE).toString()).toBe(
      "q=salsa&contract=active&status=paid&page=3&pageSize=10",
    );
  });

  it("leaves out a filter that is not applied, and still names the page and its size", () => {
    expect(toInvoiceListQuery(DEFAULT_INVOICE_PARAMS).toString()).toBe("page=1&pageSize=10");
  });
});

describe("toInvoiceList", () => {
  const RAW: RawInvoiceList = {
    items: [RAW_RANGGA],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  };

  it("reads each component's amount into the table's columns, with the backend's total", () => {
    expect(toInvoiceList(RAW).rows).toEqual([
      {
        creatorId: RAW_RANGGA.creatorId,
        creatorName: "Rangga Pratama",
        contractStatus: "active",
        fixedAmount: 500000,
        extraAmount: 200000,
        bonusAmount: null,
        penaltyAmount: 150000,
        totalAmount: 550000,
        floored: false,
        invoiceStatus: "accruing",
      },
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
        },
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000002",
          name: "Promo akhir bulan",
          rate: 100000,
          amount: 100000,
        },
      ],
      total: 200000,
    });
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
      toInvoiceList({ items: [waiting], page: 1, pageSize: 10, total: 1, totalPages: 1 }).rows[0]
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
