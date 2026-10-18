import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { jakartaMidnight } from '../src/creators/evergreen.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  RateFormulaService,
  type RateFormulaView,
} from '../src/rate-formula/rate-formula.service.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-invoices';

/**
 * The formula the invoices here are calculated with. maxPenaltyDays is sent for #100, which
 * requires it; a backend without that column yet drops it and caps at the default 3 anyway.
 */
const FORMULA = {
  latePenaltyPerDay: 50_000,
  maxPenaltyDays: 3,
  specificBonus: 100_000,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [{ threshold: 10_000, bonus: 150_000 }],
    },
    tiktok: { metric: 'views', tiers: [{ threshold: 10_000, bonus: 150_000 }] },
  },
} as const;

/** A calendar day relative to today in Jakarta, the day the app counts from. */
function day(offset: number): Date {
  const today = jakartaMidnight(new Date());
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + offset,
    ),
  );
}

describe('Invoices API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let creator: ReturnType<typeof as>;
  let contractId: string;
  let adminId: string;
  // The developer's own formula, put back once these tests are done with the singleton row.
  let savedFormula: RateFormulaView | undefined;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    adminId = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
        select: { id: true },
      })
    ).id;
    savedFormula = await app.get(RateFormulaService).read();
    await admin.put('/rate-formula').send(FORMULA).expect(200);

    const nadia = await prisma.users.create({
      data: { email: `${MARKER}-nadia@example.com` },
    });
    const kevin = await prisma.users.create({
      data: { email: `${MARKER}-kevin@example.com` },
    });

    const nadiaCreator = await prisma.creators.create({
      data: {
        user_id: nadia.id,
        first_name: `${MARKER} Nadia`,
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(30),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 2,
            fixed_rate: 2_000_000,
            contents: {
              create: [
                {
                  name: 'Late by two days',
                  type: 'evergreen',
                  deadline: day(-10),
                  status: 'link_submitted',
                  video_link: 'https://example.com/late',
                  video_submitted_at: day(-8),
                },
                {
                  name: 'Never handed in',
                  type: 'evergreen',
                  deadline: day(-20),
                },
                {
                  name: 'Specific on time',
                  type: 'specific',
                  deadline: day(-5),
                  status: 'link_submitted',
                  video_link: 'https://example.com/specific',
                  video_submitted_at: day(-5),
                },
                {
                  name: 'Specific late',
                  type: 'specific',
                  deadline: day(-5),
                  status: 'link_submitted',
                  video_link: 'https://example.com/specific-late',
                  video_submitted_at: day(-3),
                },
              ],
            },
          },
        },
      },
      select: { id: true, contracts: { select: { id: true } } },
    });
    contractId = nadiaCreator.contracts[0].id;
    creator = as(
      app,
      await signIn(app, {
        userId: nadia.id,
        role: 'creator',
        creatorId: nadiaCreator.id,
      }),
    );
    // A creator with no contract has nothing to invoice.
    await prisma.creators.create({
      data: { user_id: kevin.id, first_name: `${MARKER} Kevin` },
    });
  });

  afterAll(async () => {
    if (savedFormula?.configured) {
      const { configured: _, updatedAt: __, ...formula } = savedFormula;
      await app
        .get(RateFormulaService)
        .replace(
          formula as Parameters<RateFormulaService['replace']>[0],
          undefined,
        );
    } else if (savedFormula) {
      await prisma.$executeRaw`delete from performance_bonus_tiers`;
      await prisma.$executeRaw`delete from performance_bonus_metrics`;
      await prisma.$executeRaw`delete from rate_formula`;
    }
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  async function ours() {
    const { body } = await admin
      .get('/invoices')
      .query({ pageSize: 50 })
      .expect(200);
    return body.items.filter((item: { creatorName: string }) =>
      item.creatorName.startsWith(MARKER),
    );
  }

  async function invoice() {
    const item = (await ours()).find(
      (candidate: { contract: { id: string } }) =>
        candidate.contract.id === contractId,
    );
    expect(item).toBeDefined();
    return item;
  }

  const adjustmentPath = () => `/invoices/${contractId}/adjustments`;

  async function expectCreatedAdjustment(
    amount: number,
    reason: string,
    expectedReason = reason,
  ) {
    const startedAt = Date.now();
    const { body } = await admin
      .post(adjustmentPath())
      .send({ amount, reason })
      .expect(201);
    const finishedAt = Date.now();

    expect(body).toMatchObject({
      amount,
      reason: expectedReason,
      actorId: adminId,
      invoiceStatus: 'running',
    });
    expect(typeof body.createdAt).toBe('string');
    const createdAt = new Date(body.createdAt).getTime();
    expect(Number.isNaN(createdAt)).toBe(false);
    expect(createdAt).toBeGreaterThanOrEqual(startedAt);
    expect(createdAt).toBeLessThanOrEqual(finishedAt);

    const current = await invoice();
    expect(current.invoiceStatus).toBe('running');
    expect(current.adjustments).toContainEqual(
      expect.objectContaining({
        amount,
        reason: expectedReason,
        actorId: adminId,
        createdAt: body.createdAt,
      }),
    );
    return body;
  }

  async function expectAdjustmentStateUnchanged(action: () => Promise<unknown>) {
    const before = (await invoice()).adjustments;
    await action();
    expect((await invoice()).adjustments).toEqual(before);
  }

  it('calculates the running invoice from the database rows', async () => {
    const [nadia] = await ours();

    // FORMULA: Rp50.000 a day for at most 3 days, Rp100.000 per on-time Specific item.
    expect(nadia.components.fixedRate.amount).toBe(2_000_000);
    expect(nadia.components.additionalContent).toMatchObject({
      amount: 100_000,
      lines: [{ contentName: 'Specific on time', amount: 100_000 }],
    });
    expect(nadia.components.penalty.amount).toBe(250_000);
    expect(nadia.components.performanceBonus.status).toBe('waiting_for_data');
    expect(nadia).toMatchObject({ total: 1_850_000, floored: false });
    expect(nadia.contract.status).toBe('active');
  });

  it('returns the running lifecycle fields for an invoice not yet finalized', async () => {
    const [nadia] = await ours();

    expect(nadia).toBeDefined();
    expect(nadia).toMatchObject({
      invoiceStatus: 'running',
      adjustments: [],
      snapshot: null,
    });
  });

  it('leaves out a creator without a contract', async () => {
    const names = (await ours()).map(
      (item: { creatorName: string }) => item.creatorName,
    );

    expect(names).toEqual([`${MARKER} Nadia`]);
  });

  it('rejects paging values that are not positive integers', async () => {
    await admin.get('/invoices?page=abc').expect(400);
    await admin.get('/invoices?page=0').expect(400);
    await admin.get('/invoices?pageSize=51').expect(400);
  });

  it('searches by name and filters by contract status across the whole roster', async () => {
    const names = async (query: Record<string, string | number>) => {
      const { body } = await admin
        .get('/invoices')
        .query({ pageSize: 50, ...query })
        .expect(200);
      return body.items.map(
        (item: { creatorName: string }) => item.creatorName,
      );
    };

    expect(await names({ q: `${MARKER} nad` })).toEqual([`${MARKER} Nadia`]);
    expect(await names({ q: MARKER, contract: 'active' })).toEqual([
      `${MARKER} Nadia`,
    ]);
    expect(await names({ q: MARKER, contract: 'expired' })).toEqual([]);
  });

  it('rejects a contract status the table does not offer and an overlong search', async () => {
    await admin.get('/invoices?contract=none').expect(400);
    await admin.get(`/invoices?q=${'a'.repeat(101)}`).expect(400);
  });

  it('lets an authenticated admin add a positive adjustment and reads it back', async () => {
    await expectCreatedAdjustment(125_000, 'Approved campaign uplift');
  });

  it('lets an authenticated admin add a negative adjustment and reads it back', async () => {
    await expectCreatedAdjustment(-75_000, 'Correction for overpayment');
  });

  // OWASP Top 10:2025 A06 (Insecure Design): enforce the documented reason-length limit.
  it('accepts a reason with exactly 500 non-whitespace characters', async () => {
    const reason = 'R'.repeat(500);
    await expectCreatedAdjustment(1, reason);

    expect(
      (await invoice()).adjustments.some(
        (adjustment: { reason: string }) => adjustment.reason === reason,
      ),
    ).toBe(true);
  });

  it('trims surrounding whitespace from an adjustment reason', async () => {
    await expectCreatedAdjustment(
      1,
      '  Campaign adjustment  ',
      'Campaign adjustment',
    );
  });

  // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): invalid reasons leave no partial writes.
  it.each([
    ['missing', { amount: 10 }],
    ['blank', { amount: 10, reason: '   ' }],
    ['over 500 characters', { amount: 10, reason: 'R'.repeat(501) }],
  ])('rejects a %s reason without creating an adjustment', async (_case, body) => {
    await expectAdjustmentStateUnchanged(() =>
      admin.post(adjustmentPath()).send(body).expect(422),
    );
  });

  // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): invalid amounts leave no partial writes.
  it.each([
    ['zero', 0],
    ['more than two decimal places', 1.234],
  ])('rejects an adjustment amount with %s and makes no change', async (_case, amount) => {
    await expectAdjustmentStateUnchanged(() =>
      admin
        .post(adjustmentPath())
        .send({ amount, reason: 'Invalid amount test' })
        .expect(422),
    );
  });

  // OWASP Top 10:2025 A05 (Injection): SQL-looking reason text remains literal data.
  it('stores SQL-looking reason text literally and leaves content records unchanged', async () => {
    const reason = "Adjustment'; DROP TABLE users; --";
    const contentCountBefore = await prisma.contents.count({
      where: { contract_id: contractId },
    });

    await expectCreatedAdjustment(-1, reason);

    expect(
      (await invoice()).adjustments.some(
        (adjustment: { reason: string }) => adjustment.reason === reason,
      ),
    ).toBe(true);
    expect(
      await prisma.contents.count({ where: { contract_id: contractId } }),
    ).toBe(contentCountBefore);
    expect(
      await prisma.users.findUnique({
        where: { email: `${MARKER}-nadia@example.com` },
        select: { id: true },
      }),
    ).not.toBeNull();
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): callers cannot set server-controlled invoice fields.
  it('rejects client-supplied actor and invoice authority fields without changing adjustments', async () => {
    await expectAdjustmentStateUnchanged(() =>
      admin
        .post(adjustmentPath())
        .send({
          amount: 50,
          reason: 'Forged fields test',
          actorId: '00000000-0000-0000-0000-000000000001',
          createdAt: '2000-01-01T00:00:00.000Z',
          invoiceStatus: 'finalized',
          snapshot: { total: 1 },
          total: 1,
        })
        .expect(422),
    );
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): enforce the admin and same-origin boundaries.
  // These checks require the route to exist; a missing-route 404 is not security evidence.
  it('denies unauthenticated and creator mutations, and rejects a cross-origin admin mutation', async () => {
    const priorDevAuth = process.env.DEV_AUTH_ENABLED;
    process.env.DEV_AUTH_ENABLED = 'false';
    try {
      const secondAdminCookie = await signInAsAdmin(app, prisma, MARKER);
      await expectAdjustmentStateUnchanged(() =>
        request(app.getHttpServer())
          .post(adjustmentPath())
          .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:3000')
          .set('Sec-Fetch-Site', 'same-origin')
          .send({ amount: 10, reason: 'Unauthenticated request' })
          .expect(401),
      );
      await expectAdjustmentStateUnchanged(() =>
        creator
          .post(adjustmentPath())
          .send({ amount: 10, reason: 'Creator request' })
          .expect(403),
      );
      await expectAdjustmentStateUnchanged(() =>
        request(app.getHttpServer())
          .post(adjustmentPath())
          .set('Cookie', secondAdminCookie)
          .set('Origin', 'https://evil.example')
          .set('Sec-Fetch-Site', 'cross-site')
          .send({ amount: 10, reason: 'Cross-origin request' })
          .expect(403),
      );
    } finally {
      if (priorDevAuth === undefined) delete process.env.DEV_AUTH_ENABLED;
      else process.env.DEV_AUTH_ENABLED = priorDevAuth;
    }
  });
});
