import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
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

describe('GET /invoices (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  // Nadia signed in as herself: a creator must not read even her own invoice here.
  let nadiaAsCreator: ReturnType<typeof as>;
  let nadiaId: string;
  let kevinId: string;
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
    });
    // A creator whose typed name starts like a spreadsheet formula, for the export.
    const formulaName = await prisma.users.create({
      data: { email: `${MARKER}-formula@example.com` },
    });
    await prisma.creators.create({
      data: {
        user_id: formulaName.id,
        first_name: `=HYPERLINK("http://evil.example";"${MARKER}")`,
        contracts: {
          create: {
            start_date: day(10),
            end_date: day(70),
            contract_type: 'regular',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1_000_000,
          },
        },
      },
    });
    // A creator with no contract has nothing to invoice.
    const kevinCreator = await prisma.creators.create({
      data: { user_id: kevin.id, first_name: `${MARKER} Kevin` },
    });
    nadiaId = nadiaCreator.id;
    kevinId = kevinCreator.id;
    nadiaAsCreator = as(
      app,
      await signIn(app, {
        userId: nadia.id,
        role: 'creator',
        creatorId: nadiaId,
      }),
    );
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
      where: { first_name: { contains: MARKER } },
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
      item.creatorName.startsWith(`${MARKER} `),
    );
  }

  it('calculates the running invoice from the database rows', async () => {
    const [nadia] = await ours();

    // FORMULA: Rp50.000 a day for at most 3 days, Rp100.000 per on-time Specific item.
    expect(nadia.components.fixedRate.amount).toBe(2_000_000);
    // Both items share a deadline, so their order is the database's; read them in any order.
    expect(nadia.components.additionalContent.amount).toBe(100_000);
    expect(nadia.components.additionalContent.lines).toHaveLength(2);
    expect(nadia.components.additionalContent.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentName: 'Specific on time', amount: 100_000 }),
        expect.objectContaining({
          contentName: 'Specific late',
          amount: 0,
          basis: { fee: 100_000, late: 'yes' },
        }),
      ]),
    );
    expect(nadia.components.penalty.amount).toBe(250_000);
    expect(nadia.components.performanceBonus.status).toBe('waiting_for_data');
    expect(nadia).toMatchObject({ total: 1_850_000, floored: false });
    expect(nadia.contract.status).toBe('active');
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

  it('marks every invoice as running and filters on the invoice status', async () => {
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

  it("answers one creator's invoice with the formula and the period its popups state", async () => {
    const { body } = await admin.get(`/invoices/${nadiaId}`).expect(200);

    expect(body).toMatchObject({
      creatorId: nadiaId,
      creatorName: `${MARKER} Nadia`,
      invoiceStatus: 'accruing',
      periodNumber: 1,
      total: 1_850_000,
      formula: { latePenaltyPerDay: 50_000, specificBonus: 100_000 },
    });
    expect(
      body.components.penalty.lines.map(
        (line: { contentName: string }) => line.contentName,
      ),
    ).toEqual(['Never handed in', 'Late by two days']);
  });

  it('answers 404 for a creator with no contract and for one that does not exist', async () => {
    const none = await admin.get(`/invoices/${kevinId}`).expect(404);
    expect(none.body).toMatchObject({ code: 'INVOICE_NOT_FOUND' });

    await admin
      .get('/invoices/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('refuses an id that is not a UUID before reading the database', async () => {
    await admin.get('/invoices/not-a-uuid').expect(400);
    await admin.get(`/invoices/${encodeURIComponent("1' or '1'='1")}`).expect(400);
  });

  it('refuses a creator, even asking for their own invoice', async () => {
    const response = await nadiaAsCreator.get(`/invoices/${nadiaId}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('puts what needs action first, sorts by a column when asked, and refuses an unknown order', async () => {
    const order = async (query: Record<string, string>) => {
      const { body } = await admin
        .get('/invoices')
        .query({ pageSize: 50, q: MARKER, ...query })
        .expect(200);
      return body.items.map((item: { contract: { status: string } }) => item.contract.status);
    };

    // Nadia runs now; the formula-named creator has not started.
    expect(await order({})).toEqual(['active', 'upcoming']);
    expect(await order({ sort: 'total', order: 'asc' })).toEqual(['upcoming', 'active']);
    await admin.get('/invoices?sort=bonus').expect(400);
    await admin.get('/invoices?sort=name&order=sideways').expect(400);
  });

  it('adds up what the filtered invoices owe and counts the running ones', async () => {
    const { body } = await admin.get('/invoices').query({ q: `${MARKER} Nadia` }).expect(200);

    expect(body.summary).toMatchObject({ total: 1_850_000, formulaSet: true });
    expect(body.summary.runningInvoices).toBeGreaterThanOrEqual(2);
  });

  it('exports the filtered invoices as a CSV file an admin can open in a spreadsheet', async () => {
    const response = await admin.get('/invoices/export').query({ q: MARKER }).expect(200);

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="rate-invoicing-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    const lines = response.text.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe(
      'Creator,Kontrak,Fixed Rate,Fee Konten Tambahan,Bonus Performa,Penalti,Total,Status Invoice,Catatan',
    );
    expect(lines[1]).toBe(
      `${MARKER} Nadia,Aktif,2000000,100000,Menunggu data,250000,1850000,Berjalan,Bonus performa menunggu data`,
    );
  });

  it('writes a name that starts like a formula as text in the export (OWASP A03)', async () => {
    const response = await admin.get('/invoices/export').query({ q: 'HYPERLINK' }).expect(200);
    const row = response.text.replace(/^﻿/, '').split('\r\n')[1];

    expect(row.startsWith(`"'=HYPERLINK(""http://evil.example"";""${MARKER}"")"`)).toBe(true);
  });

  it('refuses the export to a creator and checks its filters', async () => {
    const asCreator = await nadiaAsCreator.get('/invoices/export');
    expect(asCreator.status).toBe(403);
    await admin.get('/invoices/export?status=hacked').expect(400);
  });
});
