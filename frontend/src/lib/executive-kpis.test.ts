import contract from "@/test/fixtures/executive-kpis.contract.json";
import {
  FAILED_KPIS,
  KPI_KEYS,
  toExecutiveKpis,
  type KpiKey,
} from "./executive-kpis";

/** The contract fixture with one value of one period replaced (or removed, for undefined). */
function withValue(
  period: "current" | "previous",
  key: string,
  value: unknown,
) {
  const copy = structuredClone(contract) as Record<
    string,
    Record<string, unknown>
  >;
  if (value === undefined) delete copy[period][key];
  else copy[period][key] = value;
  return copy;
}

function failedKeys(raw: unknown): KpiKey[] {
  const { readings } = toExecutiveKpis(raw);
  return KPI_KEYS.filter((key) => readings[key].status === "failed");
}

describe("KPI_KEYS", () => {
  it("names the six KPIs in the order the dashboard shows them (provisional SCRUM-311 names)", () => {
    expect(KPI_KEYS).toEqual([
      "totalSpending",
      "unpaidAmount",
      "totalViews",
      "costPer1000Views",
      "onTimeRate",
      "engagementRate",
    ]);
  });
});

describe("toExecutiveKpis", () => {
  it("reads the shared contract fixture: each KPI's current and previous value, and the links still waiting", () => {
    expect(toExecutiveKpis(contract)).toEqual({
      readings: {
        totalSpending: {
          status: "ok",
          current: 41_250_000,
          previous: 36_700_000,
        },
        unpaidAmount: { status: "ok", current: 6_800_000, previous: 0 },
        totalViews: { status: "ok", current: 1_284_500, previous: 1_102_300 },
        costPer1000Views: { status: "ok", current: 32_113.6, previous: 33_294 },
        onTimeRate: { status: "ok", current: 86.4, previous: 88.1 },
        engagementRate: { status: "ok", current: 5.12, previous: null },
      },
      linksAwaitingData: 3,
    });
  });

  it("keeps null as no data, never turning it into 0", () => {
    const kpis = toExecutiveKpis(
      withValue("current", "costPer1000Views", null),
    );

    expect(kpis.readings.costPer1000Views).toEqual({
      status: "ok",
      current: null,
      previous: 33_294,
    });
  });

  it("keeps a real 0 as 0, apart from no data", () => {
    const kpis = toExecutiveKpis(withValue("current", "totalViews", 0));

    expect(kpis.readings.totalViews).toEqual({
      status: "ok",
      current: 0,
      previous: 1_102_300,
    });
  });

  it.each([
    ["no answer", undefined],
    ["null", null],
    ["text", "kpis"],
    ["a list", []],
    ["no previous period", { current: contract.current }],
    ["no current period", { previous: contract.previous }],
    ["periods that are lists", { current: [], previous: [] }],
  ])(
    "fails every card, never showing zeros, when the block is %s",
    (_case, raw) => {
      expect(toExecutiveKpis(raw)).toEqual(FAILED_KPIS);
      expect(failedKeys(raw)).toEqual([...KPI_KEYS]);
    },
  );

  it("has no links count when the whole block failed", () => {
    expect(FAILED_KPIS.linksAwaitingData).toBeNull();
  });

  // Input space partitioning per rule: whole amounts, a non-negative decimal, and a 0–100 share.
  it.each<[KpiKey, unknown]>([
    ["totalSpending", "41250000"],
    ["totalSpending", -1],
    ["totalSpending", 1.5],
    ["totalSpending", Number.MAX_SAFE_INTEGER + 2],
    ["unpaidAmount", true],
    ["totalViews", Number.NaN],
    ["totalViews", Number.POSITIVE_INFINITY],
    ["costPer1000Views", -0.01],
    ["costPer1000Views", Number.POSITIVE_INFINITY],
    ["onTimeRate", 100.1],
    ["onTimeRate", -0.1],
    ["engagementRate", { value: 5 }],
    ["engagementRate", undefined],
  ])("fails only the %s card when its current value is %s", (key, value) => {
    expect(failedKeys(withValue("current", key, value))).toEqual([key]);
  });

  it("fails a card whose previous value is unusable, even when its current one is fine", () => {
    expect(failedKeys(withValue("previous", "onTimeRate", "88,1"))).toEqual([
      "onTimeRate",
    ]);
  });

  it("fails a card whose previous value is missing, since missing is not the same as no data", () => {
    expect(
      failedKeys(withValue("previous", "totalSpending", undefined)),
    ).toEqual(["totalSpending"]);
  });

  it.each([
    ["a share at both ends", "onTimeRate", 0],
    ["a full share", "engagementRate", 100],
    ["a decimal cost", "costPer1000Views", 0.5],
  ] as const)("accepts %s", (_case, key, value) => {
    expect(failedKeys(withValue("current", key, value))).toEqual([]);
  });

  it("fails the Total Views card when the waiting-links count is unusable, since that card shows it", () => {
    expect(failedKeys(withValue("current", "linksAwaitingData", -2))).toEqual([
      "totalViews",
    ]);
    expect(
      failedKeys(withValue("current", "linksAwaitingData", undefined)),
    ).toEqual(["totalViews"]);
  });

  it("reads a null waiting-links count as unknown, leaving Total Views usable", () => {
    const kpis = toExecutiveKpis(
      withValue("current", "linksAwaitingData", null),
    );

    expect(kpis.readings.totalViews.status).toBe("ok");
    expect(kpis.linksAwaitingData).toBeNull();
  });

  it("ignores keys outside the fixed list, so an unknown figure never reaches the page", () => {
    const raw = {
      ...contract,
      current: { ...contract.current, secretMargin: 99 },
    };

    const kpis = toExecutiveKpis(raw);

    expect(Object.keys(kpis.readings)).toEqual([...KPI_KEYS]);
    expect(JSON.stringify(kpis)).not.toContain("99");
  });

  it("does not read a value inherited through the prototype as one the backend sent", () => {
    const current = Object.create({ totalSpending: 5 }) as Record<
      string,
      unknown
    >;
    Object.assign(current, contract.current);
    delete current.totalSpending;

    expect(failedKeys({ current, previous: contract.previous })).toEqual([
      "totalSpending",
    ]);
  });
});
