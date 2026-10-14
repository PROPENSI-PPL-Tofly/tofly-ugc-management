import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signInAsAdmin } from './sessions.js';

const MARKER = 'e2e-rate-formula';

const FORMULA = {
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

interface FormulaRow {
  specific_bonus: number;
  late_penalty_per_day: number;
  updated_by: string | null;
}

interface MetricRow {
  platform: string;
  metric: string;
}

interface TierRow {
  platform: string;
  position: number;
  threshold: number;
  bonus: number;
}

/**
 * The formula is one shared row, so the suite empties the rate tables before each test and puts
 * back whatever the developer had configured once it is done.
 */
describe('/rate-formula (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let adminId: string;
  let savedFormula: Record<string, unknown>[];
  let savedMetrics: Record<string, unknown>[];
  let savedTiers: Record<string, unknown>[];
  // Set only once every rate table is copied: until then the suite must not empty them, or a
  // setup failure would lose the developer's formula with nothing to put back.
  let snapshotTaken = false;

  async function clear(): Promise<void> {
    if (!snapshotTaken) {
      throw new Error('Rate tables were not snapshotted; refusing to clear them');
    }
    await prisma.$executeRaw`delete from performance_bonus_tiers`;
    await prisma.$executeRaw`delete from performance_bonus_metrics`;
    await prisma.$executeRaw`delete from rate_formula`;
  }

  async function storedFormula(): Promise<FormulaRow[]> {
    return prisma.$queryRaw<FormulaRow[]>`
      select specific_bonus::int, late_penalty_per_day::int, updated_by::text
      from rate_formula`;
  }

  async function storedMetrics(): Promise<MetricRow[]> {
    return prisma.$queryRaw<MetricRow[]>`
      select platform::text, metric::text from performance_bonus_metrics order by platform`;
  }

  async function storedTiers(): Promise<TierRow[]> {
    return prisma.$queryRaw<TierRow[]>`
      select platform::text, position::int, threshold::int, bonus::int
      from performance_bonus_tiers order by platform, position`;
  }

  /** A tier belongs to its platform's metric row, so a raw tier insert needs one first. */
  async function instagramMetric(): Promise<void> {
    await prisma.$executeRaw`
      insert into performance_bonus_metrics (platform, metric) values ('instagram', 'views')`;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    savedFormula = await prisma.$queryRaw`select * from rate_formula`;
    savedMetrics = await prisma.$queryRaw`select * from performance_bonus_metrics`;
    savedTiers = await prisma.$queryRaw`select * from performance_bonus_tiers`;
    snapshotTaken = true;
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    adminId = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
      })
    ).id;
  });

  beforeEach(clear);

  afterAll(async () => {
    try {
      if (snapshotTaken) {
        await clear();
        for (const row of savedFormula) {
          await prisma.$executeRaw`
            insert into rate_formula
              (id, specific_bonus, late_penalty_per_day, updated_by, created_at, updated_at)
            values (${row.id}, ${row.specific_bonus}, ${row.late_penalty_per_day},
                    ${row.updated_by}::uuid, ${row.created_at}::timestamptz,
                    ${row.updated_at}::timestamptz)`;
        }
        for (const row of savedMetrics) {
          await prisma.$executeRaw`
            insert into performance_bonus_metrics (platform, metric)
            values (${row.platform}::social_platform, ${row.metric}::performance_metric)`;
        }
        for (const row of savedTiers) {
          await prisma.$executeRaw`
            insert into performance_bonus_tiers (platform, position, threshold, bonus)
            values (${row.platform}::social_platform, ${row.position}, ${row.threshold}, ${row.bonus})`;
        }
      }
    } finally {
      await prisma?.users.deleteMany({ where: { email: { startsWith: MARKER } } });
      await app?.close();
    }
  });

  describe('GET', () => {
    it('answers a formula nobody has saved as unconfigured, not as zeros or a default metric', async () => {
      const response = await admin.get('/rate-formula');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
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
  });

  describe('PUT', () => {
    it('saves the formula, answers it, and serves it back on GET', async () => {
      const saved = await admin.put('/rate-formula').send(FORMULA);

      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({ configured: true, ...FORMULA });
      expect(Number.isNaN(Date.parse(saved.body.updatedAt))).toBe(false);

      const read = await admin.get('/rate-formula');
      expect(read.body).toEqual(saved.body);
    });

    it('stores the amounts, each metric, the tiers in order, and the admin who saved them', async () => {
      await admin.put('/rate-formula').send(FORMULA);

      expect(await storedFormula()).toEqual([
        { specific_bonus: 100000, late_penalty_per_day: 50000, updated_by: adminId },
      ]);
      expect(await storedMetrics()).toEqual([
        { platform: 'instagram', metric: 'views' },
        { platform: 'tiktok', metric: 'likes' },
      ]);
      expect(await storedTiers()).toEqual([
        { platform: 'instagram', position: 1, threshold: 10000, bonus: 150000 },
        { platform: 'instagram', position: 2, threshold: 40000, bonus: 400000 },
        { platform: 'tiktok', position: 1, threshold: 5000, bonus: 100000 },
      ]);
    });

    it('stores tiers sent out of order sorted by minimum', async () => {
      await admin.put('/rate-formula').send({
        ...FORMULA,
        performanceBonus: {
          ...FORMULA.performanceBonus,
          instagram: {
            metric: 'views',
            tiers: [
              { threshold: 40000, bonus: 400000 },
              { threshold: 10000, bonus: 150000 },
            ],
          },
        },
      });

      expect((await storedTiers()).filter((t) => t.platform === 'instagram')).toEqual([
        { platform: 'instagram', position: 1, threshold: 10000, bonus: 150000 },
        { platform: 'instagram', position: 2, threshold: 40000, bonus: 400000 },
      ]);
    });

    it('stores more than five tiers, as the prototype sets no cap', async () => {
      const tiers = Array.from({ length: 7 }, (_, index) => ({
        threshold: (index + 1) * 1000,
        bonus: (index + 1) * 10000,
      }));

      const response = await admin.put('/rate-formula').send({
        ...FORMULA,
        performanceBonus: {
          ...FORMULA.performanceBonus,
          tiktok: { metric: 'shares', tiers },
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.performanceBonus.tiktok).toEqual({ metric: 'shares', tiers });
    });

    it('replaces the whole formula, leaving none of the earlier metrics or tiers behind', async () => {
      await admin.put('/rate-formula').send(FORMULA);
      const second = {
        specificBonus: 0,
        latePenaltyPerDay: 0,
        performanceBonus: {
          instagram: { metric: 'comments', tiers: [{ threshold: 1, bonus: 2 }] },
          tiktok: { metric: 'shares', tiers: [{ threshold: 3, bonus: 4 }] },
        },
      };

      await admin.put('/rate-formula').send(second);

      expect(await storedFormula()).toHaveLength(1);
      expect(await storedMetrics()).toEqual([
        { platform: 'instagram', metric: 'comments' },
        { platform: 'tiktok', metric: 'shares' },
      ]);
      expect(await storedTiers()).toEqual([
        { platform: 'instagram', position: 1, threshold: 1, bonus: 2 },
        { platform: 'tiktok', position: 1, threshold: 3, bonus: 4 },
      ]);
      expect((await admin.get('/rate-formula')).body).toMatchObject({
        configured: true,
        ...second,
      });
    });

    it('stores none of the fields the formula does not have', async () => {
      const response = await admin.put('/rate-formula').send({
        ...FORMULA,
        contentFee: 75000,
        maxPenaltyDays: 10,
        updated_by: '00000000-0000-4000-8000-000000000000',
        updatedBy: '00000000-0000-4000-8000-000000000000',
      });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('contentFee');
      expect(response.body).not.toHaveProperty('maxPenaltyDays');
      expect(response.body).not.toHaveProperty('updatedBy');
      expect((await storedFormula())[0].updated_by).toBe(adminId);
    });

    it('answers an invalid formula with 422 per field, without internals, and keeps the saved one', async () => {
      await admin.put('/rate-formula').send(FORMULA);

      const response = await admin.put('/rate-formula').send({
        ...FORMULA,
        specificBonus: -1,
        performanceBonus: {
          instagram: {
            metric: 'views',
            tiers: [
              { threshold: 100, bonus: 500000 },
              { threshold: 200, bonus: 100000 },
            ],
          },
          tiktok: { metric: 'reach', tiers: [] },
        },
      });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        message: 'Formula rate tidak valid',
        errors: {
          specificBonus: 'Bonus Specific harus antara Rp0 dan Rp10.000.000',
          'performanceBonus.instagram.tiers': 'Bonus harus naik seiring minimum.',
          'performanceBonus.tiktok.metric':
            'Metrik harus views, likes, comments, atau shares',
          'performanceBonus.tiktok.tiers': 'Minimal 1 tier.',
        },
      });
      expect(await storedFormula()).toEqual([
        expect.objectContaining({ specific_bonus: 100000 }),
      ]);
      expect(await storedMetrics()).toHaveLength(2);
      expect(await storedTiers()).toHaveLength(3);
    });

    it('answers a malformed JSON body with 400 and keeps the saved formula', async () => {
      await admin.put('/rate-formula').send(FORMULA);

      const response = await admin
        .put('/rate-formula')
        .set('Content-Type', 'application/json')
        .send('{"specificBonus": ');

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).not.toMatch(/at .*\.(ts|js)/);
      expect(await storedTiers()).toHaveLength(3);
    });
  });

  // The validator is the first line; the table constraints hold the same rules for any writer
  // that skips it.
  describe('database constraints', () => {
    it('holds at most one formula row', async () => {
      await expect(prisma.$executeRaw`
        insert into rate_formula (id, specific_bonus, late_penalty_per_day)
        values (false, 1, 1)`).rejects.toThrow();
    });

    it('accepts the largest Specific bonus and daily penalty', async () => {
      await expect(prisma.$executeRaw`
        insert into rate_formula (specific_bonus, late_penalty_per_day)
        values (10000000, 1000000)`).resolves.toBe(1);
    });

    it.each([
      ['a negative Specific bonus', -1, 1],
      ['a Specific bonus past Rp10.000.000', 10_000_001, 1],
      ['a fractional Specific bonus', 1.5, 1],
      ['a negative daily penalty', 1, -1],
      ['a daily penalty past Rp1.000.000', 1, 1_000_001],
      ['a fractional daily penalty', 1, 1.5],
    ])('refuses %s', async (_, specificBonus, penalty) => {
      await expect(prisma.$executeRaw`
        insert into rate_formula (specific_bonus, late_penalty_per_day)
        values (${specificBonus}, ${penalty})`).rejects.toThrow();
    });

    it('refuses a metric the prototype does not offer', async () => {
      await expect(prisma.$executeRaw`
        insert into performance_bonus_metrics (platform, metric)
        values ('instagram', 'reach')`).rejects.toThrow();
    });

    it('holds one metric per platform', async () => {
      await instagramMetric();

      await expect(prisma.$executeRaw`
        insert into performance_bonus_metrics (platform, metric)
        values ('instagram', 'likes')`).rejects.toThrow();
    });

    it('refuses a tier for a platform with no metric', async () => {
      await expect(prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('tiktok', 1, 1, 1)`).rejects.toThrow();
    });

    it('accepts a tier at position 6 and at the largest minimum and bonus', async () => {
      await instagramMetric();

      await expect(prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', 6, 999999999, 999999999)`).resolves.toBe(1);
    });

    it.each([
      ['position 0', 0, 1, 1],
      ['a zero minimum', 1, 0, 1],
      ['a zero bonus', 1, 1, 0],
      ['a minimum past 999.999.999', 1, 1_000_000_000, 1],
      ['a bonus past 999.999.999', 1, 1, 1_000_000_000],
      ['a fractional minimum', 1, 1.5, 1],
      ['a fractional bonus', 1, 1, 1.5],
    ])('refuses a tier with %s', async (_, position, threshold, bonus) => {
      await instagramMetric();

      await expect(prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', ${position}, ${threshold}, ${bonus})`).rejects.toThrow();
    });

    it('refuses two tiers at the same position of one platform', async () => {
      await instagramMetric();
      await prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', 1, 100, 1)`;

      await expect(prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', 1, 200, 2)`).rejects.toThrow();
    });

    it('refuses two tiers with the same minimum on one platform', async () => {
      await instagramMetric();
      await prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', 1, 100, 1)`;

      await expect(prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', 2, 100, 2)`).rejects.toThrow();
    });

    it('has no content fee or maximum penalty days column', async () => {
      const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('rate_formula', 'performance_bonus_metrics', 'performance_bonus_tiers')
          and (column_name like '%fee%' or column_name like '%max%')`;

      expect(columns).toEqual([]);
    });
  });

  // Subtask 8.1 keeps the fixed rate in contracts.fixed_rate, at most ten digits before the point.
  describe('fixed rate', () => {
    it('stores contracts.fixed_rate as numeric(12, 2)', async () => {
      const [column] = await prisma.$queryRaw<
        { numeric_precision: number; numeric_scale: number }[]
      >`
        select numeric_precision::int, numeric_scale::int from information_schema.columns
        where table_schema = 'public' and table_name = 'contracts'
          and column_name = 'fixed_rate'`;

      expect(column).toEqual({ numeric_precision: 12, numeric_scale: 2 });
    });

    it('has no second fixed rate column', async () => {
      const columns = await prisma.$queryRaw<{ table_name: string }[]>`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name like '%fixed_rate%'`;

      expect(columns).toEqual([{ table_name: 'contracts' }]);
    });
  });
});
