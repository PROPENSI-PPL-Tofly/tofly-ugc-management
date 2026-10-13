import {
  BREAKDOWN_KINDS,
  breakdownPopup,
  type InvoiceBreakdown,
} from "./invoice-breakdown";

const EMPTY_BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: { lines: [], total: 0 },
  extra: { lines: [], total: 0 },
  bonus: { lines: [], total: 0, performance: "ready" },
  penalty: { lines: [], total: 0 },
};

function breakdown(patch: Partial<InvoiceBreakdown> = {}): InvoiceBreakdown {
  return { ...EMPTY_BREAKDOWN, ...patch };
}

describe("BREAKDOWN_KINDS", () => {
  it("names the four columns that open a popup, in the table's order", () => {
    expect(BREAKDOWN_KINDS).toEqual(["fixed", "extra", "bonus", "penalty"]);
  });
});

describe("breakdownPopup", () => {
  describe("title", () => {
    it.each([
      ["fixed", "Fixed Rate · Rangga Pratama"],
      ["extra", "Konten Tambahan · Rangga Pratama"],
      ["bonus", "Bonus · Rangga Pratama"],
      ["penalty", "Penalti · Rangga Pratama"],
    ] as const)("names the %s column and the creator", (kind, title) => {
      expect(breakdownPopup(kind, breakdown()).title).toBe(title);
    });
  });

  describe("fixed rate", () => {
    const view = breakdownPopup(
      "fixed",
      breakdown({
        fixed: {
          lines: [
            { contentId: "c-1", name: "Evg_1_Rangga_01102026", rate: 500000, amount: 500000 },
            { contentId: "c-2", name: "Evg_2_Rangga_08102026", rate: 500000, amount: 500000 },
          ],
          total: 1000000,
        },
      }),
    );

    it("lists each finished content with the rate it was counted at", () => {
      expect(view.lines).toEqual([
        {
          key: "c-1",
          contentId: "c-1",
          name: "Evg_1_Rangga_01102026",
          detail: "1 konten × Rp500.000",
          amount: "Rp500.000",
          tone: "plain",
        },
        {
          key: "c-2",
          contentId: "c-2",
          name: "Evg_2_Rangga_08102026",
          detail: "1 konten × Rp500.000",
          amount: "Rp500.000",
          tone: "plain",
        },
      ]);
    });

    it("totals the column as the invoice counted it", () => {
      expect(view.total).toBe("Rp1.000.000");
    });

    it("has no note", () => {
      expect(view.note).toBeNull();
    });
  });

  describe("konten tambahan", () => {
    it("lists each extra content with its own rate", () => {
      const view = breakdownPopup(
        "extra",
        breakdown({
          extra: {
            lines: [{ contentId: "c-9", name: "Promo 10.10", rate: 300000, amount: 300000 }],
            total: 300000,
          },
        }),
      );

      expect(view.lines).toEqual([
        {
          key: "c-9",
          contentId: "c-9",
          name: "Promo 10.10",
          detail: "1 konten × Rp300.000",
          amount: "Rp300.000",
          tone: "plain",
        },
      ]);
      expect(view.total).toBe("Rp300.000");
    });
  });

  describe("bonus", () => {
    it("words a Specific content's bonus as earned for being on time", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            lines: [{ kind: "specific", contentId: "c-9", name: "Promo 10.10", amount: 100000 }],
            total: 100000,
            performance: "ready",
          },
        }),
      );

      expect(view.lines).toEqual([
        {
          key: "c-9",
          contentId: "c-9",
          name: "Promo 10.10",
          detail: "Bonus konten Specific tepat waktu",
          amount: "+ Rp100.000",
          tone: "plain",
        },
      ]);
      expect(view.total).toBe("Rp100.000");
    });

    it("words a performance bonus by its platform, the number reached and the tier it passed", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            lines: [
              {
                kind: "performance",
                contentId: "c-1",
                name: "Evg_1_Rangga_01102026",
                platform: "tiktok",
                metric: "views",
                value: 12500,
                threshold: 10000,
                amount: 250000,
              },
            ],
            total: 250000,
            performance: "ready",
          },
        }),
      );

      expect(view.lines[0].detail).toBe("TikTok · 12.500 Views (min. 10.000)");
      expect(view.lines[0].amount).toBe("+ Rp250.000");
    });

    it.each([
      ["instagram", "likes", "Instagram · 900 Likes (min. 500)"],
      ["instagram", "comments", "Instagram · 900 Comments (min. 500)"],
      ["tiktok", "shares", "TikTok · 900 Shares (min. 500)"],
    ] as const)("words %s %s", (platform, metric, detail) => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            lines: [
              {
                kind: "performance",
                contentId: "c-1",
                name: "Konten",
                platform,
                metric,
                value: 900,
                threshold: 500,
                amount: 1,
              },
            ],
            total: 1,
            performance: "ready",
          },
        }),
      );

      expect(view.lines[0].detail).toBe(detail);
    });

    it("says the performance bonus is waiting for data, never that it is zero", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({ bonus: { lines: [], total: 0, performance: "waiting" } }),
      );

      expect(view.note).toBe("Bonus performa: Menunggu data");
    });

    it("keeps the waiting note beside the bonuses that are already known", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            lines: [{ kind: "specific", contentId: "c-9", name: "Promo 10.10", amount: 100000 }],
            total: 100000,
            performance: "waiting",
          },
        }),
      );

      expect(view.lines).toHaveLength(1);
      expect(view.note).toBe("Bonus performa: Menunggu data");
    });

    it("has no note once the performance data is in", () => {
      expect(breakdownPopup("bonus", breakdown()).note).toBeNull();
    });
  });

  describe("penalti", () => {
    const view = breakdownPopup(
      "penalty",
      breakdown({
        penalty: {
          lines: [
            {
              contentId: "c-3",
              name: "Evg_3_Rangga_15102026",
              daysLate: 3,
              ratePerDay: 50000,
              amount: 150000,
              ongoing: true,
            },
            {
              contentId: "c-4",
              name: "Evg_4_Rangga_22102026",
              daysLate: 1,
              ratePerDay: 50000,
              amount: 50000,
              ongoing: false,
            },
          ],
          total: 200000,
        },
      }),
    );

    it("counts a late content by its days late, and says when the count is still running", () => {
      expect(view.lines[0].detail).toBe("Telat 3 hari × Rp50.000 · masih berjalan");
    });

    it("leaves a content that was handed in late at the days it was late by", () => {
      expect(view.lines[1].detail).toBe("Telat 1 hari × Rp50.000");
    });

    it("writes each penalty and the total as amounts taken away, in the danger tone", () => {
      expect(view.lines.map((line) => [line.amount, line.tone])).toEqual([
        ["− Rp150.000", "danger"],
        ["− Rp50.000", "danger"],
      ]);
      expect(view.total).toBe("− Rp200.000");
    });
  });

  describe("an empty column", () => {
    it.each([
      ["fixed", "Belum ada konten yang selesai."],
      ["extra", "Belum ada konten tambahan yang selesai."],
      ["bonus", "Belum ada konten yang mendapat bonus."],
      ["penalty", "Tidak ada keterlambatan."],
    ] as const)("says why %s has nothing to list, with no total under it", (kind, empty) => {
      const view = breakdownPopup(kind, breakdown());

      expect(view.lines).toEqual([]);
      expect(view.empty).toBe(empty);
      expect(view.total).toBeNull();
    });
  });

  describe("corner cases", () => {
    it("keeps a line whose content is not known as plain text, with nothing to open", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            lines: [{ kind: "specific", contentId: null, name: "Konten lama", amount: 1000 }],
            total: 1000,
            performance: "ready",
          },
        }),
      );

      expect(view.lines[0].contentId).toBeNull();
      expect(view.lines[0].name).toBe("Konten lama");
    });

    it("gives two lines of one content different keys, as a content can earn two bonuses", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            lines: [
              { kind: "specific", contentId: "c-9", name: "Promo 10.10", amount: 100000 },
              {
                kind: "performance",
                contentId: "c-9",
                name: "Promo 10.10",
                platform: "instagram",
                metric: "views",
                value: 20000,
                threshold: 10000,
                amount: 50000,
              },
              { kind: "specific", contentId: null, name: "Tanpa id", amount: 1 },
              { kind: "specific", contentId: null, name: "Tanpa id", amount: 1 },
            ],
            total: 150002,
            performance: "ready",
          },
        }),
      );

      const keys = view.lines.map((line) => line.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("shows the invoice's own total, not a sum worked out again in the browser", () => {
      const view = breakdownPopup(
        "fixed",
        breakdown({
          fixed: {
            lines: [{ contentId: "c-1", name: "Evg_1", rate: 500000, amount: 500000 }],
            total: 499999,
          },
        }),
      );

      expect(view.total).toBe("Rp499.999");
    });

    it("writes a penalty of a single day and of no days at all", () => {
      const view = breakdownPopup(
        "penalty",
        breakdown({
          penalty: {
            lines: [
              { contentId: "c-1", name: "A", daysLate: 0, ratePerDay: 50000, amount: 0, ongoing: true },
            ],
            total: 0,
          },
        }),
      );

      expect(view.lines[0].detail).toBe("Telat 0 hari × Rp50.000 · masih berjalan");
      expect(view.lines[0].amount).toBe("− Rp0");
      expect(view.total).toBe("− Rp0");
    });
  });
});
