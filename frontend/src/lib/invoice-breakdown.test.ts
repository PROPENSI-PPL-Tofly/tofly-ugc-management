import {
  BREAKDOWN_KINDS,
  breakdownPopup,
  type InvoiceBreakdown,
} from "./invoice-breakdown";

const EMPTY_BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: {
    period: { number: 2, start: "2026-09-01", end: "2026-11-30", quotaDone: 0, quotaTotal: 12 },
    total: 0,
    notStarted: false,
  },
  extra: { lines: [], total: 0 },
  bonus: {
    lines: [],
    total: 0,
    performance: "ready",
    rules: { tiers: [], specificBonus: 0 },
  },
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
      ["fixed", "Fixed Rate Kontrak · Rangga Pratama"],
      ["extra", "Fee Konten Tambahan · Rangga Pratama"],
      ["bonus", "Bonus Performa · Rangga Pratama"],
      ["penalty", "Penalti · Rangga Pratama"],
    ] as const)("names the %s column as the prototype's popup does, and the creator", (kind, title) => {
      expect(breakdownPopup(kind, breakdown()).title).toBe(title);
    });
  });

  describe("fixed rate", () => {
    const view = breakdownPopup(
      "fixed",
      breakdown({
        fixed: {
          period: { number: 2, start: "2026-09-01", end: "2026-11-30", quotaDone: 7, quotaTotal: 12 },
          total: 5000000,
          notStarted: false,
        },
      }),
    );

    it("is one line for the contract period, paid in full, never a list of contents", () => {
      expect(view.lines).toEqual([
        {
          key: "Kontrak Periode 2",
          contentId: null,
          name: "Kontrak Periode 2",
          detail: "1 Sep 2026 – 30 Nov 2026 · Kuota selesai 7/12",
          amount: "Rp5.000.000",
          tone: "plain",
        },
      ]);
    });

    it("totals the column as the invoice counted it, with no tier info and no note", () => {
      expect(view.total).toBe("Rp5.000.000");
      expect(view.info).toBeNull();
      expect(view.note).toBeNull();
    });

    it("leaves the dates out of a period that has none, keeping the quota", () => {
      const undated = breakdownPopup(
        "fixed",
        breakdown({
          fixed: {
            period: { number: 1, start: null, end: null, quotaDone: 0, quotaTotal: 10 },
            total: 3000000,
            notStarted: false,
          },
        }),
      );

      expect(undated.lines[0].detail).toBe("Kuota selesai 0/10");
    });

    it("says a contract has not started yet, rather than that nothing is filled in", () => {
      const view = breakdownPopup(
        "fixed",
        breakdown({ fixed: { ...EMPTY_BREAKDOWN.fixed, total: 0, notStarted: true } }),
      );

      expect(view.lines).toEqual([]);
      expect(view.empty).toBe("Kontrak belum dimulai.");
      expect(view.total).toBeNull();
    });

    it("says the contract's fixed rate is not filled in when a running contract has none", () => {
      const view = breakdownPopup("fixed", breakdown());

      expect(view.lines).toEqual([]);
      expect(view.empty).toBe("Fixed rate kontrak belum diisi.");
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

    it("says no extra content is finished yet when there is none", () => {
      expect(breakdownPopup("extra", breakdown()).empty).toBe(
        "Belum ada konten tambahan yang selesai.",
      );
    });
  });

  describe("bonus", () => {
    it("words a Specific content's bonus as earned for being on time", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            ...EMPTY_BREAKDOWN.bonus,
            lines: [{ kind: "specific", contentId: "c-9", name: "Promo 10.10", amount: 100000 }],
            total: 100000,
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

    it("words a performance bonus by its platform, the number reached and the tier it earned", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            ...EMPTY_BREAKDOWN.bonus,
            lines: [
              {
                kind: "performance",
                contentId: "c-1",
                name: "Evg_1_Rangga_01102026",
                platform: "tiktok",
                metric: "views",
                value: 12500,
                tier: 2,
                amount: 250000,
              },
            ],
            total: 250000,
          },
        }),
      );

      expect(view.lines[0].detail).toBe("TikTok · 12.500 Views · Tier 2");
      expect(view.lines[0].amount).toBe("+ Rp250.000");
    });

    it.each([
      ["instagram", "likes", "Instagram · 900 Likes · Tier 1"],
      ["instagram", "comments", "Instagram · 900 Comments · Tier 1"],
      ["tiktok", "shares", "TikTok · 900 Shares · Tier 1"],
    ] as const)("words %s %s", (platform, metric, detail) => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            ...EMPTY_BREAKDOWN.bonus,
            lines: [
              {
                kind: "performance",
                contentId: "c-1",
                name: "Konten",
                platform,
                metric,
                value: 900,
                tier: 1,
                amount: 1,
              },
            ],
            total: 1,
          },
        }),
      );

      expect(view.lines[0].detail).toBe(detail);
    });

    describe("the tier info above the lines", () => {
      const rules = {
        tiers: [
          {
            platform: "instagram" as const,
            metric: "views" as const,
            steps: [
              { min: 50000, bonus: 150000 },
              { min: 10000, bonus: 50000 },
            ],
          },
          { platform: "tiktok" as const, metric: "likes" as const, steps: [{ min: 2000, bonus: 75000 }] },
          { platform: "tiktok" as const, metric: "shares" as const, steps: [] },
        ],
        specificBonus: 100000,
      };

      it("states the rule, each platform's tiers lowest first, and the Specific bonus", () => {
        const view = breakdownPopup(
          "bonus",
          breakdown({ bonus: { ...EMPTY_BREAKDOWN.bonus, rules } }),
        );

        expect(view.info).toEqual([
          "Per konten, dipakai tier tertinggi yang tercapai.",
          "Instagram (Views) — Tier 1: ≥10.000 → Rp50.000 · Tier 2: ≥50.000 → Rp150.000",
          "TikTok (Likes) — Tier 1: ≥2.000 → Rp75.000",
          "Specific — Rp100.000 per konten Specific yang selesai tepat waktu",
        ]);
      });

      it("is there even when no content has earned a bonus, so the admin sees what would", () => {
        const view = breakdownPopup(
          "bonus",
          breakdown({ bonus: { ...EMPTY_BREAKDOWN.bonus, rules } }),
        );

        expect(view.lines).toEqual([]);
        expect(view.info).not.toBeNull();
        expect(view.empty).toBe("Belum ada konten yang mendapat bonus.");
      });

      it("leaves out the Specific bonus when it is not set, keeping the rule", () => {
        const view = breakdownPopup("bonus", breakdown());

        expect(view.info).toEqual(["Per konten, dipakai tier tertinggi yang tercapai."]);
      });
    });

    it("says the performance bonus is waiting for data, never that it is zero", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({ bonus: { ...EMPTY_BREAKDOWN.bonus, performance: "waiting" } }),
      );

      expect(view.note).toBe("Bonus performa: Menunggu data");
    });

    it("keeps the waiting note beside the bonuses that are already known", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            ...EMPTY_BREAKDOWN.bonus,
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
              daysLate: 5,
              chargedDays: 3,
              ratePerDay: 50000,
              amount: 150000,
              ongoing: true,
            },
            {
              contentId: "c-4",
              name: "Evg_4_Rangga_22102026",
              daysLate: 1,
              chargedDays: 1,
              ratePerDay: 50000,
              amount: 50000,
              ongoing: false,
            },
          ],
          total: 200000,
        },
      }),
    );

    it("says how many of the days late are charged once the cap is reached, and that it still runs", () => {
      expect(view.lines[0].detail).toBe("Telat 5 hari · dihitung 3 hari × Rp50.000 · berjalan");
    });

    it("leaves out the charged days when every day late is charged", () => {
      expect(view.lines[1].detail).toBe("Telat 1 hari × Rp50.000");
    });

    it("writes each penalty and the total as amounts taken away, in the danger tone", () => {
      expect(view.lines.map((line) => [line.amount, line.tone])).toEqual([
        ["− Rp150.000", "danger"],
        ["− Rp50.000", "danger"],
      ]);
      expect(view.total).toBe("− Rp200.000");
    });

    it("says there is no lateness when there is none", () => {
      expect(breakdownPopup("penalty", breakdown()).empty).toBe("Tidak ada keterlambatan.");
    });
  });

  describe("corner cases", () => {
    it("keeps a line whose content is not known as plain text, with nothing to open", () => {
      const view = breakdownPopup(
        "bonus",
        breakdown({
          bonus: {
            ...EMPTY_BREAKDOWN.bonus,
            lines: [{ kind: "specific", contentId: null, name: "Konten lama", amount: 1000 }],
            total: 1000,
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
            ...EMPTY_BREAKDOWN.bonus,
            lines: [
              { kind: "specific", contentId: "c-9", name: "Promo 10.10", amount: 100000 },
              {
                kind: "performance",
                contentId: "c-9",
                name: "Promo 10.10",
                platform: "instagram",
                metric: "views",
                value: 20000,
                tier: 1,
                amount: 50000,
              },
              { kind: "specific", contentId: null, name: "Tanpa id", amount: 1 },
              { kind: "specific", contentId: null, name: "Tanpa id", amount: 1 },
            ],
            total: 150002,
          },
        }),
      );

      const keys = view.lines.map((line) => line.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("shows the invoice's own total, not a sum worked out again in the browser", () => {
      const view = breakdownPopup(
        "extra",
        breakdown({
          extra: {
            lines: [{ contentId: "c-1", name: "Promo", rate: 500000, amount: 500000 }],
            total: 499999,
          },
        }),
      );

      expect(view.total).toBe("Rp499.999");
    });

    it("writes a penalty of no days at all", () => {
      const view = breakdownPopup(
        "penalty",
        breakdown({
          penalty: {
            lines: [
              {
                contentId: "c-1",
                name: "A",
                daysLate: 0,
                chargedDays: 0,
                ratePerDay: 50000,
                amount: 0,
                ongoing: true,
              },
            ],
            total: 0,
          },
        }),
      );

      expect(view.lines[0].detail).toBe("Telat 0 hari × Rp50.000 · berjalan");
      expect(view.lines[0].amount).toBe("− Rp0");
      expect(view.total).toBe("− Rp0");
    });
  });
});
