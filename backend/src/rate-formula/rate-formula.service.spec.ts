import type { RateFormula } from './rate-formula.js';
import {
  RateFormulaService,
  type RateFormulaClient,
} from './rate-formula.service.js';

const ADMIN_USER_ID = '99999999-9999-4999-8999-999999999999';
const UPDATED_AT = new Date('2026-10-14T03:00:00Z');

const FORMULA: RateFormula = {
  specificBonus: 100000,
  latePenaltyPerDay: 50000,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [
        { threshold: 10000, bonus: 150000 },
        { threshold: 40000, bonus: 400000 },
      ],
    },
    tiktok: {
      metric: 'likes',
      tiers: [{ threshold: 5000, bonus: 100000 }],
    },
  },
};

// Whole rupiah and whole counts, so every amount is an integer column and reads back as a number.
const FORMULA_ROW = {
  id: true,
  specific_bonus: 100000,
  late_penalty_per_day: 50000,
  updated_by: ADMIN_USER_ID,
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
};

const METRIC_ROWS = [
  { platform: 'instagram', metric: 'views' },
  { platform: 'tiktok', metric: 'likes' },
];

const TIER_ROWS = [
  { platform: 'instagram', position: 1, threshold: 10000, bonus: 150000 },
  { platform: 'instagram', position: 2, threshold: 40000, bonus: 400000 },
  { platform: 'tiktok', position: 1, threshold: 5000, bonus: 100000 },
];

/**
 * A stand-in for Postgres: the transaction hands its work the same client, so the service may
 * read back inside or after the transaction and the test still sees one consistent store.
 */
function fakeClient(
  formulaRow: unknown,
  metricRows: unknown[],
  tierRows: unknown[],
) {
  const client = {
    rate_formula: {
      findUnique: vi.fn().mockResolvedValue(formulaRow),
      upsert: vi.fn().mockResolvedValue(formulaRow),
    },
    performance_bonus_metrics: {
      findMany: vi.fn().mockResolvedValue(metricRows),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: metricRows.length }),
    },
    performance_bonus_tiers: {
      findMany: vi.fn().mockResolvedValue(tierRows),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: tierRows.length }),
    },
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work(client),
    ),
  };
  return client;
}

function saved() {
  return fakeClient(FORMULA_ROW, METRIC_ROWS, TIER_ROWS);
}

/** Every row the service asked a table to insert, across however many createMany calls. */
function inserted(table: { createMany: { mock: { calls: unknown[][] } } }): unknown[] {
  return table.createMany.mock.calls.flatMap(
    ([args]) => (args as { data: unknown[] }).data,
  );
}

describe('RateFormulaService', () => {
  describe('read', () => {
    it('answers an unsaved formula as unconfigured, never as zero amounts or a default metric', async () => {
      const client = fakeClient(null, [], []);
      const service = new RateFormulaService(client satisfies RateFormulaClient);

      await expect(service.read()).resolves.toEqual({
        configured: false,
        specificBonus: null,
        latePenaltyPerDay: null,
        performanceBonus: {
          instagram: { metric: null, tiers: [] },
          tiktok: { metric: null, tiers: [] },
        },
        updatedAt: null,
      });
    });

    it('answers the saved formula, each platform with its metric and tiers', async () => {
      const service = new RateFormulaService(saved() satisfies RateFormulaClient);

      await expect(service.read()).resolves.toEqual({
        configured: true,
        ...FORMULA,
        updatedAt: UPDATED_AT.toISOString(),
      });
    });

    it('reads the tiers in position order per platform', async () => {
      const client = saved();
      const service = new RateFormulaService(client);

      await service.read();

      expect(client.performance_bonus_tiers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ platform: 'asc' }, { position: 'asc' }],
        }),
      );
    });

    it('does not answer who saved it', async () => {
      const service = new RateFormulaService(saved());

      expect(await service.read()).not.toHaveProperty('updatedBy');
    });
  });

  describe('replace', () => {
    it('saves the amounts and the admin who saved them inside one transaction', async () => {
      const client = saved();
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, ADMIN_USER_ID);

      expect(client.$transaction).toHaveBeenCalledOnce();
      const amounts = {
        specific_bonus: 100000,
        late_penalty_per_day: 50000,
        updated_by: ADMIN_USER_ID,
      };
      expect(client.rate_formula.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: true },
          create: expect.objectContaining(amounts),
          update: expect.objectContaining(amounts),
        }),
      );
    });

    it("replaces every platform's metric", async () => {
      const client = saved();
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, ADMIN_USER_ID);

      expect(client.performance_bonus_metrics.deleteMany).toHaveBeenCalledWith({});
      expect(inserted(client.performance_bonus_metrics)).toEqual([
        { platform: 'instagram', metric: 'views' },
        { platform: 'tiktok', metric: 'likes' },
      ]);
    });

    it('replaces every earlier tier with the new ones, numbered from 1 per platform', async () => {
      const client = saved();
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, ADMIN_USER_ID);

      expect(client.performance_bonus_tiers.deleteMany).toHaveBeenCalledWith({});
      expect(inserted(client.performance_bonus_tiers)).toEqual([
        { platform: 'instagram', position: 1, threshold: 10000, bonus: 150000 },
        { platform: 'instagram', position: 2, threshold: 40000, bonus: 400000 },
        { platform: 'tiktok', position: 1, threshold: 5000, bonus: 100000 },
      ]);
    });

    // A tier references its platform's metric row, so the metrics go in first.
    it('writes the metrics before the tiers', async () => {
      const client = saved();
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, ADMIN_USER_ID);

      expect(
        client.performance_bonus_metrics.createMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        client.performance_bonus_tiers.createMany.mock.invocationCallOrder[0],
      );
    });

    it('records no admin behind the local development stand-in', async () => {
      const client = saved();
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, undefined);

      expect(client.rate_formula.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ updated_by: null }),
        }),
      );
    });

    it('answers the formula as saved', async () => {
      const service = new RateFormulaService(saved());

      await expect(service.replace(FORMULA, ADMIN_USER_ID)).resolves.toEqual({
        configured: true,
        ...FORMULA,
        updatedAt: UPDATED_AT.toISOString(),
      });
    });

    // The transaction is what rolls the formula row back; the service must not swallow the
    // failure and answer as if the save went through.
    it('fails when writing the tiers fails', async () => {
      const client = saved();
      const failure = new Error('insert failed');
      client.performance_bonus_tiers.createMany.mockRejectedValue(failure);
      const service = new RateFormulaService(client);

      await expect(service.replace(FORMULA, ADMIN_USER_ID)).rejects.toBe(failure);
    });

    it('fails when writing the metrics fails', async () => {
      const client = saved();
      const failure = new Error('insert failed');
      client.performance_bonus_metrics.createMany.mockRejectedValue(failure);
      const service = new RateFormulaService(client);

      await expect(service.replace(FORMULA, ADMIN_USER_ID)).rejects.toBe(failure);
    });
  });
});
