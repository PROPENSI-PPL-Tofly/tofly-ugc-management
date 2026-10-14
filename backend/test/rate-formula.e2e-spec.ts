import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signInAsAdmin } from './sessions.js';

const MARKER = 'e2e-rate-formula';

const FORMULA = {
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

interface FormulaRow {
  specific_bonus: string;
  late_penalty_per_day: string;
  updated_by: string | null;
}

interface TierRow {
  platform: string;
  position: number;
  threshold: string;
  bonus: string;
}

/**
 * The formula is one shared row, so the suite empties both tables before each test and puts back
 * whatever the developer had configured once it is done.
 */
describe('/rate-formula (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let adminId: string;
  let savedFormula: Record<string, unknown>[];
  let savedTiers: Record<string, unknown>[];
  // Set only once both tables are copied: until then the suite must not empty them, or a setup
  // failure would lose the developer's formula with nothing to put back.
  let snapshotTaken = false;

  async function clear(): Promise<void> {
    if (!snapshotTaken) {
      throw new Error('Rate tables were not snapshotted; refusing to clear them');
    }
    await prisma.$executeRaw`delete from performance_bonus_tiers`;
    await prisma.$executeRaw`delete from rate_formula`;
  }

  async function storedFormula(): Promise<FormulaRow[]> {
    return prisma.$queryRaw<FormulaRow[]>`
      select specific_bonus::text, late_penalty_per_day::text, updated_by::text
      from rate_formula`;
  }

  async function storedTiers(): Promise<TierRow[]> {
    return prisma.$queryRaw<TierRow[]>`
      select platform::text, position::int, threshold::text, bonus::text
      from performance_bonus_tiers order by platform, position`;
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
    it('answers a formula nobody has saved as unconfigured, not as zeros', async () => {
      const response = await admin.get('/rate-formula');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        configured: false,
        specificBonus: null,
        latePenaltyPerDay: null,
        performanceBonusTiers: { instagram: [], tiktok: [] },
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

    it('stores the amounts with their cents, the tiers in order, and the admin who saved them', async () => {
      await admin.put('/rate-formula').send(FORMULA);

      expect(await storedFormula()).toEqual([
        {
          specific_bonus: '250000.00',
          late_penalty_per_day: '50000.50',
          updated_by: adminId,
        },
      ]);
      expect(await storedTiers()).toEqual([
        { platform: 'instagram', position: 1, threshold: '10000.00', bonus: '100000.00' },
        { platform: 'instagram', position: 2, threshold: '50000.00', bonus: '300000.00' },
        { platform: 'tiktok', position: 1, threshold: '20000.00', bonus: '150000.00' },
      ]);
    });

    it('replaces the whole formula, leaving none of the earlier tiers behind', async () => {
      await admin.put('/rate-formula').send(FORMULA);
      const second = {
        specificBonus: 100000,
        latePenaltyPerDay: 0,
        performanceBonusTiers: {
          instagram: [],
          tiktok: [{ threshold: 1, bonus: 2 }],
        },
      };

      await admin.put('/rate-formula').send(second);

      expect(await storedFormula()).toHaveLength(1);
      expect(await storedTiers()).toEqual([
        { platform: 'tiktok', position: 1, threshold: '1.00', bonus: '2.00' },
      ]);
      expect((await admin.get('/rate-formula')).body).toMatchObject({
        configured: true,
        ...second,
      });
    });

    it('keeps a formula of zeros apart from an unconfigured one', async () => {
      const zeros = {
        specificBonus: 0,
        latePenaltyPerDay: 0,
        performanceBonusTiers: { instagram: [], tiktok: [] },
      };

      await admin.put('/rate-formula').send(zeros);

      expect((await admin.get('/rate-formula')).body).toMatchObject({
        configured: true,
        ...zeros,
      });
    });

    it('stores none of the fields the formula does not have', async () => {
      const response = await admin.put('/rate-formula').send({
        ...FORMULA,
        contentFee: 75000,
        updated_by: '00000000-0000-4000-8000-000000000000',
        updatedBy: '00000000-0000-4000-8000-000000000000',
      });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('contentFee');
      expect(response.body).not.toHaveProperty('updatedBy');
      expect((await storedFormula())[0].updated_by).toBe(adminId);
    });

    it('answers an invalid formula with 422 per field, without internals, and keeps the saved one', async () => {
      await admin.put('/rate-formula').send(FORMULA);

      const response = await admin.put('/rate-formula').send({
        ...FORMULA,
        specificBonus: -1,
        performanceBonusTiers: {
          instagram: [
            { threshold: 200, bonus: 1 },
            { threshold: 100, bonus: 1 },
          ],
          tiktok: [],
        },
      });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        message: 'Formula rate tidak valid',
        errors: {
          specificBonus: 'Bonus Specific tidak boleh negatif',
          'performanceBonusTiers.instagram.1.threshold':
            'Threshold harus lebih besar dari tier sebelumnya',
        },
      });
      expect(await storedFormula()).toEqual([
        expect.objectContaining({ specific_bonus: '250000.00' }),
      ]);
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

    it.each([
      ['a negative specific bonus', -1, 1],
      ['a negative daily penalty', 1, -1],
      ['an amount past ten integer digits', 10_000_000_000, 1],
    ])('refuses %s', async (_, specificBonus, penalty) => {
      await expect(prisma.$executeRaw`
        insert into rate_formula (specific_bonus, late_penalty_per_day)
        values (${specificBonus}, ${penalty})`).rejects.toThrow();
    });

    it.each([
      ['position 0', 0, 1, 1],
      ['position 6', 6, 1, 1],
      ['a negative threshold', 1, -1, 1],
      ['a negative bonus', 1, 1, -1],
    ])('refuses a tier at %s', async (_, position, threshold, bonus) => {
      await expect(prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', ${position}, ${threshold}, ${bonus})`).rejects.toThrow();
    });

    it('refuses two tiers at the same position of one platform', async () => {
      await prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', 1, 100, 1)`;

      await expect(prisma.$executeRaw`
        insert into performance_bonus_tiers (platform, position, threshold, bonus)
        values ('instagram', 1, 200, 1)`).rejects.toThrow();
    });

    it('has no content fee column', async () => {
      const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('rate_formula', 'performance_bonus_tiers')
          and column_name like '%fee%'`;

      expect(columns).toEqual([]);
    });
  });
});
