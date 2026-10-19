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

const MARKER = 'e2e-invoices';

const FORMULA = {
  latePenaltyPerDay: 50_000,
  maxPenaltyDays: 3,
  specificBonus: 100_000,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [{ threshold: 10_000, bonus: 150_000 }],
    },
    tiktok: {
      metric: 'views',
      tiers: [{ threshold: 10_000, bonus: 150_000 }],
    },
  },
} as const;

/** A calendar day relative to today in Jakarta. */
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
  let nadiaId: string;
  let kevinId: string;
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
    nadiaId = nadiaCreator.id;

    creator = as(
      app,
      await signIn(app, {
        userId: nadia.id,
        role: 'creator',
        creatorId: nadiaCreator.id,
      }),
    );

    const kevinCreator = await prisma.creators.create({
      data: { user_id: kevin.id, first_name: `${MARKER} Kevin` },
      select: { id: true },
    });

    kevinId = kevinCreator.id;
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

    await prisma.users.deleteMany({
      where: { email: { startsWith: MARKER } },
    });

    await app.close();
  });

  async function ours() {
    const { body } = await admin
      .get('/invoices')
      .query({ pageSize: 50 })
      .expect(200);

    return body.items.filter((item: { creatorName: string }) =>
      item.creatorName.startsWith(`${MARKER} `),
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

    expect(current.invoiceStatus).toBe('accruing');
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

  async function expectAdjustmentStateUnchanged(
    action: () => Promise<unknown>,
  ) {
    const before = (await invoice()).adjustments;

    await action();

    expect((await invoice()).adjustments).toEqual(before);
  }

  it('calculates the running invoice from the database rows', async () => {
    const [nadia] = await ours();

    expect(nadia.components.fixedRate.amount).toBe(2_000_000);
    expect(nadia.components.additionalContent.amount).toBe(100_000);
    expect(nadia.components.additionalContent.lines).toHaveLength(2);
    expect(nadia.components.additionalContent.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentName: 'Specific on time',
          amount: 100_000,
        }),
        expect.objectContaining({
          contentName: 'Specific late',
          amount: 0,
          basis: { fee: 100_000, late: 'yes' },
        }),
      ]),
    );
    expect(nadia.components.penalty.amount).toBe(250_000);
    expect(nadia.components.performanceBonus.status).toBe(
      'waiting_for_data',
    );
    expect(nadia).toMatchObject({ total: 1_850_000, floored: false });
    expect(nadia.contract.status).toBe('active');
  });

  it('returns the lifecycle fields for an invoice not yet finalized', async () => {
    const [nadia] = await ours();

    expect(nadia).toMatchObject({
      invoiceStatus: 'accruing',
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

    expect(await names({ q: `${MARKER} nad` })).toEqual([
      `${MARKER} Nadia`,
    ]);
    expect(await names({ q: MARKER, contract: 'active' })).toEqual([
      `${MARKER} Nadia`,
    ]);
    expect(await names({ q: MARKER, contract: 'expired' })).toEqual([]);
  });

  it('rejects an unsupported contract status and an overlong search', async () => {
    const status = await admin.get('/invoices?contract=none').expect(400);
    const search = await admin
      .get(`/invoices?q=${'a'.repeat(101)}`)
      .expect(400);

    // Each 400 names the query value that was refused, not some other failure.
    expect(status.body).toMatchObject({
      statusCode: 400,
      message: 'contract must be one of active, upcoming, expired',
    });
    expect(search.body).toMatchObject({
      statusCode: 400,
      message: 'q must be 100 characters or fewer',
    });
  });

  it('filters by invoice pipeline status', async () => {
    const [nadia] = await ours();

    expect(nadia.invoiceStatus).toBe('accruing');

    const running = await admin
      .get('/invoices')
      .query({ q: `${MARKER} Nadia`, status: 'accruing' })
      .expect(200);

    expect(running.body.total).toBe(1);

    const paid = await admin
      .get('/invoices')
      .query({ q: MARKER, status: 'paid' })
      .expect(200);

    expect(paid.body).toMatchObject({ items: [], total: 0 });
    await admin.get('/invoices?status=hacked').expect(400);
  });

  it("answers one creator's invoice with the formula and period for its breakdown", async () => {
    const { body } = await admin.get(`/invoices/${nadiaId}`).expect(200);

    expect(body).toMatchObject({
      creatorId: nadiaId,
      creatorName: `${MARKER} Nadia`,
      invoiceStatus: 'accruing',
      periodNumber: 1,
      total: 1_850_000,
      formula: {
        latePenaltyPerDay: 50_000,
        specificBonus: 100_000,
      },
    });

    expect(
      body.components.penalty.lines.map(
        (line: { contentName: string }) => line.contentName,
      ),
    ).toEqual(['Never handed in', 'Late by two days']);
  });

  it('answers 404 for a creator with no contract and for a nonexistent creator', async () => {
    const none = await admin.get(`/invoices/${kevinId}`).expect(404);

    expect(none.body).toMatchObject({ code: 'INVOICE_NOT_FOUND' });

    await admin
      .get('/invoices/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('rejects an id that is not a UUID before reading the database', async () => {
    const plain = await admin.get('/invoices/not-a-uuid').expect(400);
    const injection = await admin
      .get(`/invoices/${encodeURIComponent("1' or '1'='1")}`)
      .expect(400);

    // ParseUUIDPipe refuses both ids, so no lookup runs and no invoice is answered.
    for (const response of [plain, injection]) {
      expect(response.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed (uuid is expected)',
      });
    }
  });

  it('refuses a creator access to their own invoice', async () => {
    const response = await creator.get(`/invoices/${nadiaId}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sorts invoices and rejects unsupported sort options', async () => {
    const order = async (query: Record<string, string>) => {
      const { body } = await admin
        .get('/invoices')
        .query({ pageSize: 50, q: MARKER, ...query })
        .expect(200);

      return body.items.map(
        (item: { contract: { status: string } }) => item.contract.status,
      );
    };

    expect(await order({})).toEqual(['active']);
    expect(await order({ sort: 'total', order: 'asc' })).toEqual(['active']);

    await admin.get('/invoices?sort=bonus').expect(400);
    await admin.get('/invoices?sort=name&order=sideways').expect(400);
  });

  it('summarizes filtered invoice totals and running invoices', async () => {
    const { body } = await admin
      .get('/invoices')
      .query({ q: `${MARKER} Nadia` })
      .expect(200);

    expect(body.summary).toMatchObject({
      total: 1_850_000,
      formulaSet: true,
    });

    const running = await admin.get('/invoices?status=accruing').expect(200);

    expect(body.summary.runningInvoices).toBe(running.body.total);
    expect(body.summary.runningInvoices).toBeGreaterThanOrEqual(1);
  });

  it('lets an authenticated admin add a positive adjustment and reads it back', async () => {
    await expectCreatedAdjustment(125_000, 'Approved campaign uplift');
  });

  it('lets an authenticated admin add a negative adjustment and reads it back', async () => {
    await expectCreatedAdjustment(-75_000, 'Correction for overpayment');
  });

  // OWASP Top 10:2025 A06 — enforce the documented reason-length limit.
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

  // OWASP Top 10:2025 A10 — invalid reasons must not create partial writes.
  it.each([
    ['missing', { amount: 10 }],
    ['blank', { amount: 10, reason: '   ' }],
    ['over 500 characters', { amount: 10, reason: 'R'.repeat(501) }],
  ])(
    'rejects a %s reason without creating an adjustment',
    async (_case, body) => {
      await expectAdjustmentStateUnchanged(() =>
        admin.post(adjustmentPath()).send(body).expect(422),
      );
    },
  );

  // OWASP Top 10:2025 A10 — invalid amounts must not create partial writes.
  it.each([
    ['zero', 0],
    ['more than two decimal places', 1.234],
  ])(
    'rejects an adjustment amount with %s and makes no change',
    async (_case, amount) => {
      await expectAdjustmentStateUnchanged(() =>
        admin
          .post(adjustmentPath())
          .send({ amount, reason: 'Invalid amount test' })
          .expect(422),
      );
    },
  );

  // OWASP Top 10:2025 A05 — SQL-looking reason text must remain literal data.
  it('stores SQL-looking reason text literally without changing other records', async () => {
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

  // OWASP Top 10:2025 A01 — clients cannot set server-controlled fields.
  it('rejects forged actor and invoice authority fields without changing adjustments', async () => {
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

  // OWASP Top 10:2025 A01 — enforce admin authentication and same-origin boundaries.
  it('denies unauthenticated and creator mutations and rejects cross-origin admin mutations', async () => {
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
      if (priorDevAuth === undefined) {
        delete process.env.DEV_AUTH_ENABLED;
      } else {
        process.env.DEV_AUTH_ENABLED = priorDevAuth;
      }
    }
  });

  // The listing sums adjustments in the database and reads adjustment rows for its page only;
  // cutting the same list into pages must not change its order, amounts or summary.
  it('pages, sorts and sums with the adjustments of every kept invoice as the unpaged list does', async () => {
    const created: { name: string; contractId: string }[] = [];

    for (const [suffix, fixedRate] of [
      ['A', 1_000_000],
      ['B', 2_000_000],
    ] as const) {
      const user = await prisma.users.create({
        data: { email: `${MARKER}-paging-${suffix}@example.com` },
      });
      const name = `${MARKER} Paging ${suffix}`;
      const row = await prisma.creators.create({
        data: {
          user_id: user.id,
          first_name: name,
          contracts: {
            create: {
              start_date: day(-30),
              end_date: day(30),
              contract_type: 'regular',
              days_between: 14,
              content_quota: 1,
              fixed_rate: fixedRate,
            },
          },
        },
        select: { contracts: { select: { id: true } } },
      });
      created.push({ name, contractId: row.contracts[0].id });
    }

    const [a, b] = created;
    for (const [target, amount] of [
      [a, 1_500_000.25],
      [a, 0.5],
      [b, -0.25],
    ] as const) {
      await admin
        .post(`/invoices/${target.contractId}/adjustments`)
        .send({ amount, reason: 'Paging adjustment' })
        .expect(201);
    }

    const query = { q: `${MARKER} Paging`, sort: 'total', order: 'desc' };
    const { body: whole } = await admin
      .get('/invoices')
      .query({ ...query, pageSize: 50 })
      .expect(200);
    const pages = [];
    for (const page of [1, 2]) {
      pages.push(
        (
          await admin
            .get('/invoices')
            .query({ ...query, page, pageSize: 1 })
            .expect(200)
        ).body,
      );
    }

    // A's Rp1.000.000 plus Rp1.500.000,75 outranks B's Rp2.000.000 less Rp0,25.
    expect(whole.items.map((item: { creatorName: string }) => item.creatorName)).toEqual([
      a.name,
      b.name,
    ]);
    expect(
      whole.items.map(
        (item: { adjustments: { amount: number }[] }) =>
          item.adjustments.map((adjustment) => adjustment.amount),
      ),
    ).toEqual([[1_500_000.25, 0.5], [-0.25]]);
    expect(whole.summary.total).toBe(
      whole.items[0].total + whole.items[1].total,
    );
    expect(pages.flatMap((page) => page.items)).toEqual(whole.items);
    for (const page of pages) {
      expect(page).toMatchObject({ total: 2, totalPages: 2 });
      expect(page.summary).toEqual(whole.summary);
    }
  });

  // OWASP Top 10:2025 A06 and A08 — finalization must persist the calculation snapshot.
  it('finalizes an ended invoice with a complete persisted calculation snapshot', async () => {
    const user = await prisma.users.create({
      data: { email: `${MARKER}-finalization@example.com` },
    });

    const creatorRow = await prisma.creators.create({
      data: {
        user_id: user.id,
        first_name: `${MARKER} Finalization`,
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(-1),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1_000_000,
            contents: {
              create: [
                {
                  name: `${MARKER} submitted evergreen`,
                  type: 'evergreen',
                  deadline: day(-2),
                  status: 'link_submitted',
                  video_link: 'https://example.com/finalization-evergreen',
                  video_submitted_at: day(-2),
                  platform: 'instagram',
                  views: 0,
                },
                {
                  name: `${MARKER} on-time specific`,
                  type: 'specific',
                  deadline: day(-3),
                  status: 'link_submitted',
                  video_link: 'https://example.com/finalization-specific',
                  video_submitted_at: day(-3),
                },
              ],
            },
          },
        },
      },
      select: { contracts: { select: { id: true } } },
    });

    const endedContractId = creatorRow.contracts[0].id;
    const reason = 'Finalization adjustment';

    await admin
      .post(`/invoices/${endedContractId}/adjustments`)
      .send({ amount: 25_000, reason })
      .expect(201);

    const { body: finalized } = await admin
      .post(`/invoices/${endedContractId}/finalize`)
      .expect(201);

    expect(finalized).toMatchObject({
      invoiceStatus: 'finalized',
      snapshot: {
        fixedRate: { amount: 1_000_000, status: 'calculated' },
        additionalContent: { amount: 100_000, status: 'calculated' },
        performanceBonus: { amount: 0, status: 'calculated' },
        penalty: { amount: 0, status: 'calculated' },
        adjustments: [
          { amount: 25_000, reason, actorId: adminId },
        ],
        rawTotal: 1_125_000,
        total: 1_125_000,
        floored: false,
      },
    });

    const { body: listed } = await admin
      .get('/invoices')
      .query({ pageSize: 50 })
      .expect(200);

    const finalizedInvoice = listed.items.find(
      (item: { contract: { id: string } }) =>
        item.contract.id === endedContractId,
    );

    expect(finalizedInvoice).toMatchObject({
      invoiceStatus: 'finalized',
      snapshot: finalized.snapshot,
      adjustments: [{ amount: 25_000, reason, actorId: adminId }],
      total: 1_125_000,
    });
  });
});