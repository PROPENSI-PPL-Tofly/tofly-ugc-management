import {
  FAILED_KPIS,
  KPI_KEYS,
  type ExecutiveKpis,
  type KpiKey,
} from "./executive-kpis";
import {
  HIGHER_IS_BETTER,
  KPI_STRATEGIES,
  LOWER_IS_BETTER,
  NEUTRAL,
  POINTS,
  RELATIVE,
  describeTrend,
  type Direction,
  type KpiStrategy,
} from "./executive-kpi-strategies";

function strategy(key: KpiKey): KpiStrategy {
  const found = KPI_STRATEGIES.find((entry) => entry.key === key);
  if (!found) throw new Error(`No strategy for ${key}`);
  return found;
}

describe("KPI_STRATEGIES", () => {
  it("has one strategy per KPI, in the dashboard's order", () => {
    expect(KPI_STRATEGIES.map((entry) => entry.key)).toEqual([...KPI_KEYS]);
  });

  it.each<[KpiKey, string]>([
    ["totalSpending", "Total Spending"],
    ["unpaidAmount", "Belum Dibayar"],
    ["totalViews", "Total Views"],
    ["costPer1000Views", "Biaya per 1.000 Views"],
    ["onTimeRate", "On-time Rate"],
    ["engagementRate", "Engagement Rate"],
  ])("labels %s as the design does: %s", (key, label) => {
    expect(strategy(key).label).toBe(label);
  });

  it.each<[KpiKey, number, string]>([
    ["totalSpending", 41_240_000, "Rp41,2 jt"],
    ["unpaidAmount", 6_800_000, "Rp6,8 jt"],
    ["totalViews", 1_284_500, "1,3 jt"],
    ["costPer1000Views", 32_113.6, "Rp32.114"],
    ["onTimeRate", 86.4, "86,4%"],
    ["engagementRate", 5.12, "5,12%"],
  ])("writes %s's figure %d as %s", (key, value, text) => {
    expect(strategy(key).format(value)).toBe(text);
  });

  it.each<[KpiKey, string]>([
    [
      "totalSpending",
      "Total invoice yang difinalisasi di rentang ini. Invoice Cancelled tidak dihitung.",
    ],
    ["unpaidAmount", "Bagian Total Spending yang belum Paid."],
    [
      "totalViews",
      "Views Instagram + TikTok dari link yang dikirim di rentang ini (tersinkron atau diisi manual).",
    ],
    ["costPer1000Views", "Total Spending ÷ Total Views × 1.000."],
    [
      "onTimeRate",
      "Konten yang dikirim sampai deadline ÷ konten yang jatuh tempo di rentang ini.",
    ],
    ["engagementRate", "(Likes + komentar + share) ÷ views."],
  ])(
    "explains %s with the design's formula when there is no figure",
    (key, formula) => {
      expect(strategy(key).tip(null)).toBe(formula);
    },
  );

  it.each<KpiKey>(["totalSpending", "unpaidAmount"])(
    "puts the full Rupiah value of %s before its formula, since the card shows it short",
    (key) => {
      expect(strategy(key).tip(41_240_000)).toBe(
        `Nilai penuh Rp41.240.000. ${strategy(key).tip(null)}`,
      );
    },
  );

  it.each<KpiKey>([
    "totalViews",
    "costPer1000Views",
    "onTimeRate",
    "engagementRate",
  ])(
    "gives %s only its formula, since the card already shows the figure in full",
    (key) => {
      expect(strategy(key).tip(12)).toBe(strategy(key).tip(null));
    },
  );

  it.each<[KpiKey, typeof RELATIVE]>([
    ["totalSpending", RELATIVE],
    ["unpaidAmount", RELATIVE],
    ["totalViews", RELATIVE],
    ["costPer1000Views", RELATIVE],
    ["onTimeRate", POINTS],
    ["engagementRate", POINTS],
  ])("measures %s's change the agreed way", (key, measure) => {
    expect(strategy(key).change).toBe(measure);
  });

  it.each<[KpiKey, typeof NEUTRAL]>([
    ["totalSpending", NEUTRAL],
    ["unpaidAmount", LOWER_IS_BETTER],
    ["totalViews", HIGHER_IS_BETTER],
    ["costPer1000Views", LOWER_IS_BETTER],
    ["onTimeRate", HIGHER_IS_BETTER],
    ["engagementRate", HIGHER_IS_BETTER],
  ])("judges %s's direction with the agreed polarity", (key, polarity) => {
    expect(strategy(key).polarity).toBe(polarity);
  });
});

describe("the polarity strategies", () => {
  it.each<[typeof NEUTRAL, Direction, string]>([
    [NEUTRAL, "up", "flat"],
    [NEUTRAL, "down", "flat"],
    [NEUTRAL, "flat", "flat"],
    [HIGHER_IS_BETTER, "up", "good"],
    [HIGHER_IS_BETTER, "down", "bad"],
    [HIGHER_IS_BETTER, "flat", "flat"],
    [LOWER_IS_BETTER, "up", "bad"],
    [LOWER_IS_BETTER, "down", "good"],
    [LOWER_IS_BETTER, "flat", "flat"],
  ])("judges a move %#", (polarity, direction, tone) => {
    expect(polarity.judge(direction)).toBe(tone);
  });
});

describe("the change measures", () => {
  it("measures a relative change in percent of the previous value", () => {
    expect(RELATIVE.measure(110, 100)).toBeCloseTo(10);
    expect(RELATIVE.unit).toBe("%");
  });

  it("measures a rate's change as the difference in percentage points", () => {
    expect(POINTS.measure(86.4, 88.1)).toBeCloseTo(-1.7);
    expect(POINTS.unit).toBe(" pp");
  });
});

describe("describeTrend", () => {
  it.each([
    ["no current figure", null, 100],
    ["no previous figure", 100, null],
    ["no figure at all", null, null],
  ])("has no comparison with %s", (_case, current, previous) => {
    expect(
      describeTrend(strategy("totalViews"), { current, previous }),
    ).toEqual({ kind: "none" });
  });

  it("says a rise against the previous range, in percent, judged by the KPI's polarity", () => {
    expect(
      describeTrend(strategy("totalViews"), {
        current: 1_124,
        previous: 1_000,
      }),
    ).toEqual({
      kind: "change",
      direction: "up",
      tone: "good",
      text: "12,4%",
    });
  });

  it("says a fall in a cost as good, since lower is better", () => {
    expect(
      describeTrend(strategy("costPer1000Views"), {
        current: 900,
        previous: 1_000,
      }),
    ).toEqual({
      kind: "change",
      direction: "down",
      tone: "good",
      text: "10%",
    });
  });

  it("says a rate's fall in percentage points", () => {
    expect(
      describeTrend(strategy("onTimeRate"), { current: 86.4, previous: 88.1 }),
    ).toEqual({
      kind: "change",
      direction: "down",
      tone: "bad",
      text: "1,7 pp",
    });
  });

  it("keeps Total Spending's rise neutral: more spending is not bad by itself", () => {
    expect(
      describeTrend(strategy("totalSpending"), { current: 120, previous: 100 }),
    ).toMatchObject({
      direction: "up",
      tone: "flat",
    });
  });

  it.each([
    ["just above the flat band", 100.06, "up"],
    ["inside the flat band", 100.04, "flat"],
    ["just below the flat band", 99.94, "down"],
  ])("reads a change %s as %s", (_case, current, direction) => {
    expect(
      describeTrend(strategy("totalViews"), { current, previous: 100 }),
    ).toMatchObject({ direction });
  });

  it("calls an unchanged figure flat, whatever its polarity", () => {
    expect(
      describeTrend(strategy("unpaidAmount"), { current: 500, previous: 500 }),
    ).toEqual({
      kind: "change",
      direction: "flat",
      tone: "flat",
      text: "0%",
    });
  });

  it("never divides by a previous 0: a rise from nothing names the previous value instead", () => {
    const trend = describeTrend(strategy("unpaidAmount"), {
      current: 6_800_000,
      previous: 0,
    });

    expect(trend).toEqual({
      kind: "fromZero",
      direction: "up",
      previousText: "Rp0",
    });
    expect(JSON.stringify(trend)).not.toMatch(/Infinity|NaN/);
  });

  it("calls 0 after 0 flat", () => {
    expect(
      describeTrend(strategy("totalViews"), { current: 0, previous: 0 }),
    ).toEqual({
      kind: "fromZero",
      direction: "flat",
      previousText: "0",
    });
  });

  it("names a rate's previous 0 in the rate's own format", () => {
    expect(
      describeTrend(strategy("engagementRate"), { current: 5.12, previous: 0 }),
    ).toEqual({
      kind: "fromZero",
      direction: "up",
      previousText: "0,00%",
    });
  });
});

describe("the Total Views note", () => {
  const withLinks = (linksAwaitingData: number | null): ExecutiveKpis => ({
    ...FAILED_KPIS,
    linksAwaitingData,
  });

  it("counts the links still waiting for data", () => {
    expect(strategy("totalViews").note?.(withLinks(3))).toBe(
      "3 link belum ada data",
    );
  });

  it("says so for none too, as the design does", () => {
    expect(strategy("totalViews").note?.(withLinks(0))).toBe(
      "0 link belum ada data",
    );
  });

  it("has no note when the count is unknown", () => {
    expect(strategy("totalViews").note?.(withLinks(null))).toBeNull();
  });

  it.each<KpiKey>([
    "totalSpending",
    "unpaidAmount",
    "costPer1000Views",
    "onTimeRate",
    "engagementRate",
  ])("is the only note: %s has none", (key) => {
    expect(strategy(key).note).toBeUndefined();
  });
});
