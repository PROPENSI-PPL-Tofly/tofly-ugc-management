import { Prisma } from '@prisma/client';
import type { RateFormula } from './rate-formula.js';
import {
  RateFormulaService,
  type RateFormulaClient,
} from './rate-formula.service.js';

const ADMIN_USER_ID = '99999999-9999-4999-8999-999999999999';
const UPDATED_AT = new Date('2026-10-14T03:00:00Z');

const FORMULA: RateFormula = {
  specificBonus: 250000,
  latePenaltyPerDay: 50000.5,
  performanceBonusTiers: {
    instagram: [
      { threshold: 10000, bonus: 100000 },
      { threshold: 50000, bonus: 300000 },
    ],
    tiktok: [{ threshold: 20000, bonus: 150000 }],
  },
};

const FORMULA_ROW = {
  id: true,
  specific_bonus: new Prisma.Decimal('250000'),
  late_penalty_per_day: new Prisma.Decimal('50000.50'),
  updated_by: ADMIN_USER_ID,
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
};

const TIER_ROWS = [
  { platform: 'instagram', position: 1, threshold: new Prisma.Decimal('10000'), bonus: new Prisma.Decimal('100000') },
  { platform: 'instagram', position: 2, threshold: new Prisma.Decimal('50000'), bonus: new Prisma.Decimal('300000') },
  { platform: 'tiktok', position: 1, threshold: new Prisma.Decimal('20000'), bonus: new Prisma.Decimal('150000') },
];

/**
 * A stand-in for Postgres: the transaction hands its work the same client, so the service may
 * read back inside or after the transaction and the test still sees one consistent store.
 */
function fakeClient(formulaRow: unknown, tierRows: unknown[]) {
  const client = {
    rate_formula: {
      findUnique: vi.fn().mockResolvedValue(formulaRow),
      upsert: vi.fn().mockResolvedValue(formulaRow),
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

/** Every tier row the service asked to insert, across however many createMany calls. */
function insertedTiers(client: ReturnType<typeof fakeClient>): unknown[] {
  return client.performance_bonus_tiers.createMany.mock.calls.flatMap(
    ([args]) => (args as { data: unknown[] }).data,
  );
}

describe('RateFormulaService', () => {
  describe('read', () => {
    it('answers an unsaved formula as unconfigured, never as zero amounts', async () => {
      const client = fakeClient(null, []);
      const service = new RateFormulaService(client satisfies RateFormulaClient);

      await expect(service.read()).resolves.toEqual({
        configured: false,
        specificBonus: null,
        latePenaltyPerDay: null,
        performanceBonusTiers: { instagram: [], tiktok: [] },
        updatedAt: null,
      });
    });

    it('answers the saved formula in rupiah numbers, tiers grouped by platform', async () => {
      const client = fakeClient(FORMULA_ROW, TIER_ROWS);
      const service = new RateFormulaService(client satisfies RateFormulaClient);

      await expect(service.read()).resolves.toEqual({
        configured: true,
        ...FORMULA,
        updatedAt: UPDATED_AT.toISOString(),
      });
    });

    it('does not answer who saved it', async () => {
      const service = new RateFormulaService(fakeClient(FORMULA_ROW, TIER_ROWS));

      expect(await service.read()).not.toHaveProperty('updatedBy');
    });

    it('lists a platform with no saved tiers as an empty list', async () => {
      const client = fakeClient(FORMULA_ROW, [TIER_ROWS[0]]);
      const service = new RateFormulaService(client);

      await expect(service.read()).resolves.toMatchObject({
        performanceBonusTiers: {
          instagram: [{ threshold: 10000, bonus: 100000 }],
          tiktok: [],
        },
      });
    });
  });

  describe('replace', () => {
    it('saves the amounts and the admin who saved them inside one transaction', async () => {
      const client = fakeClient(FORMULA_ROW, TIER_ROWS);
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, ADMIN_USER_ID);

      expect(client.$transaction).toHaveBeenCalledOnce();
      const saved = {
        specific_bonus: 250000,
        late_penalty_per_day: 50000.5,
        updated_by: ADMIN_USER_ID,
      };
      expect(client.rate_formula.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: true },
          create: expect.objectContaining(saved),
          update: expect.objectContaining(saved),
        }),
      );
    });

    it('replaces every earlier tier with the new ones, numbered from 1 per platform', async () => {
      const client = fakeClient(FORMULA_ROW, TIER_ROWS);
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, ADMIN_USER_ID);

      expect(client.performance_bonus_tiers.deleteMany).toHaveBeenCalledWith({});
      expect(insertedTiers(client)).toEqual([
        { platform: 'instagram', position: 1, threshold: 10000, bonus: 100000 },
        { platform: 'instagram', position: 2, threshold: 50000, bonus: 300000 },
        { platform: 'tiktok', position: 1, threshold: 20000, bonus: 150000 },
      ]);
    });

    it('clears the tiers when the formula has none', async () => {
      const client = fakeClient(FORMULA_ROW, []);
      const service = new RateFormulaService(client);

      await service.replace(
        { ...FORMULA, performanceBonusTiers: { instagram: [], tiktok: [] } },
        ADMIN_USER_ID,
      );

      expect(client.performance_bonus_tiers.deleteMany).toHaveBeenCalledWith({});
      expect(insertedTiers(client)).toEqual([]);
    });

    it('records no admin behind the local development stand-in', async () => {
      const client = fakeClient(FORMULA_ROW, TIER_ROWS);
      const service = new RateFormulaService(client);

      await service.replace(FORMULA, undefined);

      expect(client.rate_formula.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ updated_by: null }),
        }),
      );
    });

    it('answers the formula as saved', async () => {
      const service = new RateFormulaService(fakeClient(FORMULA_ROW, TIER_ROWS));

      await expect(service.replace(FORMULA, ADMIN_USER_ID)).resolves.toEqual({
        configured: true,
        ...FORMULA,
        updatedAt: UPDATED_AT.toISOString(),
      });
    });

    // The transaction is what rolls the formula row back; the service must not swallow the
    // failure and answer as if the save went through.
    it('fails when writing the tiers fails', async () => {
      const client = fakeClient(FORMULA_ROW, TIER_ROWS);
      const failure = new Error('insert failed');
      client.performance_bonus_tiers.createMany.mockRejectedValue(failure);
      const service = new RateFormulaService(client);

      await expect(service.replace(FORMULA, ADMIN_USER_ID)).rejects.toBe(failure);
    });
  });
});
