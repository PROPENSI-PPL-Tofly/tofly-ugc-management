import { INVOICE_FIXTURE_ROWS } from "./invoice.fixture";
import { BREAKDOWN_KINDS, type InvoiceBreakdown } from "./invoice-breakdown";
import { loadInvoiceBreakdown } from "./invoice-breakdown.server";
import { currentRole } from "./session.server";

// Who is asking is read from the session on the server; here it is whatever a test says.
vi.mock("./session.server", () => ({ currentRole: vi.fn() }));

const asRole = (role: "admin" | "creator" | null) => vi.mocked(currentRole).mockResolvedValue(role);

/** The columns that list contents; the fixed rate is the contract period's, one amount. */
const LISTED = BREAKDOWN_KINDS.filter((kind) => kind !== "fixed") as ("extra" | "bonus" | "penalty")[];

/** What the lines of one column add up to. */
function sumOf(breakdown: InvoiceBreakdown, kind: (typeof LISTED)[number]): number {
  return breakdown[kind].lines.reduce((sum, line) => sum + line.amount, 0);
}

describe("loadInvoiceBreakdown", () => {
  beforeEach(() => asRole("admin"));

  it("answers an admin with the creator's breakdown, named as the table names them", async () => {
    const breakdown = await loadInvoiceBreakdown("creator-rangga");

    expect(breakdown?.creatorName).toBe("Rangga Pratama");
  });

  describe("agrees with the table it is opened from", () => {
    it.each(INVOICE_FIXTURE_ROWS.map((row) => [row.name, row] as const))(
      "totals each of %s's columns as the table's row does",
      async (_name, row) => {
        const breakdown = (await loadInvoiceBreakdown(row.creatorId)) as InvoiceBreakdown;

        expect(breakdown.fixed.total).toBe(row.fixedAmount);
        expect(breakdown.extra.total).toBe(row.extraAmount);
        expect(breakdown.bonus.total).toBe(row.bonusAmount ?? 0);
        expect(breakdown.penalty.total).toBe(row.penaltyAmount);
      },
    );

    it.each(INVOICE_FIXTURE_ROWS.map((row) => [row.name, row.creatorId] as const))(
      "adds %s's lines up to each column's total",
      async (_name, creatorId) => {
        const breakdown = (await loadInvoiceBreakdown(creatorId)) as InvoiceBreakdown;

        for (const kind of LISTED) {
          expect(sumOf(breakdown, kind)).toBe(breakdown[kind].total);
        }
      },
    );

    it("says the performance bonus is waiting exactly where the table reads Menunggu data", async () => {
      for (const row of INVOICE_FIXTURE_ROWS) {
        const breakdown = (await loadInvoiceBreakdown(row.creatorId)) as InvoiceBreakdown;

        expect(breakdown.bonus.performance).toBe(row.bonusAmount === null ? "waiting" : "ready");
      }
    });
  });

  it("lists every content once, so a line opens the content it names", async () => {
    for (const row of INVOICE_FIXTURE_ROWS) {
      const breakdown = (await loadInvoiceBreakdown(row.creatorId)) as InvoiceBreakdown;
      const ids = LISTED.flatMap((kind) => breakdown[kind].lines.map((line) => line.contentId));

      expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    }
  });

  it("gives an empty column no lines and a zero total", async () => {
    const row = INVOICE_FIXTURE_ROWS.find((candidate) => candidate.penaltyAmount === 0);
    const breakdown = (await loadInvoiceBreakdown(row?.creatorId ?? "")) as InvoiceBreakdown;

    expect(breakdown.penalty).toEqual({ lines: [], total: 0 });
  });

  describe("refuses", () => {
    it("a creator nobody knows", async () => {
      await expect(loadInvoiceBreakdown("creator-nobody")).resolves.toBeNull();
    });

    it.each(["__proto__", "constructor", "toString", ""])(
      "a key that is not a creator's, such as %j",
      async (creatorId) => {
        await expect(loadInvoiceBreakdown(creatorId)).resolves.toBeNull();
      },
    );

    it("an id that is not text, as anything can be posted to a server action", async () => {
      await expect(loadInvoiceBreakdown(42 as unknown as string)).resolves.toBeNull();
    });

    it.each([["creator"], [null]] as const)(
      "anyone who is not an admin (%s), without reading a breakdown",
      async (role) => {
        asRole(role);

        await expect(loadInvoiceBreakdown("creator-rangga")).resolves.toBeNull();
      },
    );
  });

  describe("follows the prototype's rules", () => {
    it("bills the fixed rate per contract period, with the quota done out of the quota", async () => {
      for (const row of INVOICE_FIXTURE_ROWS) {
        const { fixed } = (await loadInvoiceBreakdown(row.creatorId)) as InvoiceBreakdown;

        expect(fixed.period.number).toBeGreaterThanOrEqual(1);
        expect(fixed.period.quotaDone).toBeLessThanOrEqual(fixed.period.quotaTotal);
        expect(fixed.notStarted).toBe(row.fixedAmount === 0 && row.contractStatus === "upcoming");
      }
    });

    it("charges no content more days than the cap of three", async () => {
      for (const row of INVOICE_FIXTURE_ROWS) {
        const { penalty } = (await loadInvoiceBreakdown(row.creatorId)) as InvoiceBreakdown;

        for (const line of penalty.lines) {
          expect(line.chargedDays).toBeLessThanOrEqual(3);
          expect(line.chargedDays).toBeLessThanOrEqual(line.daysLate);
          expect(line.amount).toBe(line.chargedDays * line.ratePerDay);
        }
      }
    });

    it("pays each performance bonus at its tier's amount", async () => {
      for (const row of INVOICE_FIXTURE_ROWS) {
        const { bonus } = (await loadInvoiceBreakdown(row.creatorId)) as InvoiceBreakdown;

        for (const line of bonus.lines) {
          if (line.kind !== "performance") continue;
          const rule = bonus.rules.tiers.find(
            (candidate) => candidate.platform === line.platform && candidate.metric === line.metric,
          );
          const steps = [...(rule?.steps ?? [])].sort((a, b) => a.min - b.min);

          expect(steps[line.tier - 1]?.bonus).toBe(line.amount);
          expect(line.value).toBeGreaterThanOrEqual(steps[line.tier - 1]?.min ?? Infinity);
        }
      }
    });
  });
});
