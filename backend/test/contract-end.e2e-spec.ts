import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// Every email created here starts with this marker so the cleanup never touches anything else.
const MARKER = 'e2e-contract-end';

function iso(offset: number): string {
  return day(offset).toISOString().slice(0, 10);
}

const NOTE = 'Konten diunggah ulang dari creator lain.';

describe('Akhiri Kontrak Lebih Awal (e2e, PBI-37)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;

  /**
   * A creator whose period 1 runs from 30 days ago to 29 days ahead with one content due in 10
   * days, and a period 2 that starts after it; signed in.
   */
  async function creatorWithRunningPeriod(name: string) {
    const created = await prisma.creators.create({
      data: {
        first_name: 'Dewi',
        last_name: 'Lestari',
        users: { create: { email: `${MARKER}-${name}@example.com` } },
        contracts: {
          create: [
            {
              start_date: day(-30),
              end_date: day(29),
              contract_type: 'probation',
              days_between: 14,
              content_quota: 1,
              fixed_rate: 1_000_000,
              invoice: { create: {} },
              contents: {
                create: { name: 'Evg_1_Dewi Lestari', type: 'evergreen', deadline: day(10) },
              },
            },
            {
              start_date: day(30),
              end_date: day(90),
              contract_type: 'regular',
              days_between: 14,
              content_quota: 1,
              fixed_rate: 1_000_000,
              invoice: { create: {} },
            },
          ],
        },
      },
      select: {
        id: true,
        user_id: true,
        contracts: { select: { id: true }, orderBy: { start_date: 'asc' } },
      },
    });
    const cookie = await signIn(app, {
      userId: created.user_id,
      role: 'creator',
      creatorId: created.id,
    });
    return {
      id: created.id,
      running: created.contracts[0].id,
      waiting: created.contracts[1].id,
      creator: as(app, cookie),
    };
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({ where: { users: { email: { startsWith: MARKER } } } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('previews the consequences without saving anything', async () => {
    const dewi = await creatorWithRunningPeriod('preview');
    const before = await prisma.contracts.findUniqueOrThrow({ where: { id: dewi.running } });

    const { body } = await admin
      .post(`/creators/${dewi.id}/contracts/${dewi.running}/early-end/preview`)
      .send({ invoice: 'pay', lastDay: iso(5), reason: 'violation', note: NOTE, upcomingPeriods: 'delete' })
      .expect(200);

    expect(body).toMatchObject({
      lastDay: iso(5),
      originalEndDate: iso(29),
      finalizableFrom: iso(6),
      closing: [{ name: 'Evg_1_Dewi Lestari', deadline: iso(10) }],
      deletedPeriods: [{ contractId: dewi.waiting, periodNumber: 2 }],
      access: 'after_invoice_paid',
    });
    expect(await prisma.contracts.findUniqueOrThrow({ where: { id: dewi.running } })).toEqual(before);
    expect(await prisma.contracts.count({ where: { id: dewi.waiting } })).toBe(1);
  });

  it('pays as agreed: moves the end, closes late content, deletes period 2, keeps the creator in', async () => {
    const dewi = await creatorWithRunningPeriod('pay');

    await admin
      .post(`/creators/${dewi.id}/contracts/${dewi.running}/early-end`)
      .send({ invoice: 'pay', lastDay: iso(5), reason: 'violation', note: NOTE, upcomingPeriods: 'delete' })
      .expect(200);

    const saved = await prisma.contracts.findUniqueOrThrow({
      where: { id: dewi.running },
      include: { invoice: true, contents: true },
    });
    expect(saved).toMatchObject({
      end_date: day(5),
      original_end_date: day(29),
      end_reason: 'violation',
      end_note: NOTE,
      invoice: { status: 'running' },
    });
    expect(saved.contents[0].closed_at).toBeInstanceOf(Date);
    expect(await prisma.contracts.count({ where: { id: dewi.waiting } })).toBe(0);
    // The invoice is still to be paid, so the creator keeps access.
    expect((await dewi.creator.get('/me/invoices')).status).toBe(200);
  });

  // PRD 3.1 + PBI-37: a cancelled invoice with nothing else left closes access at once, on the
  // creator's very next request.
  it('cancels the invoice and closes the creator out on their next request', async () => {
    const dewi = await creatorWithRunningPeriod('cancel');
    expect((await dewi.creator.get('/me/invoices')).status).toBe(200);

    const { body } = await admin
      .post(`/creators/${dewi.id}/contracts/${dewi.running}/early-end`)
      .send({ invoice: 'cancel', reason: 'fraud', note: NOTE, upcomingPeriods: 'delete' })
      .expect(200);

    expect(body).toMatchObject({ invoiceStatus: 'cancelled', lastDay: iso(0), access: 'closed_now' });
    expect(
      await prisma.invoices.findUniqueOrThrow({ where: { contract_id: dewi.running } }),
    ).toMatchObject({ status: 'cancelled', cancelled_at: expect.any(Date) });
    expect((await dewi.creator.get('/me/invoices')).status).toBe(401);
  });

  // AC 15: "Pertahankan" keeps period 2 and, with it, the creator's access.
  it('keeps the waiting period when asked, so a cancelled invoice leaves the creator in', async () => {
    const dewi = await creatorWithRunningPeriod('keep');

    const { body } = await admin
      .post(`/creators/${dewi.id}/contracts/${dewi.running}/early-end`)
      .send({ invoice: 'cancel', reason: 'other', note: NOTE, upcomingPeriods: 'keep' })
      .expect(200);

    expect(body).toMatchObject({ access: 'open_for_upcoming', deletedPeriods: [] });
    expect(await prisma.contracts.count({ where: { id: dewi.waiting } })).toBe(1);
    expect((await dewi.creator.get('/me/invoices')).status).toBe(200);
  });

  // OWASP A06:2025: two admins at once. The Finalize lock lets one through; the other is told.
  it('ends the contract once when two admins confirm at the same moment', async () => {
    const dewi = await creatorWithRunningPeriod('race');
    const send = () =>
      admin
        .post(`/creators/${dewi.id}/contracts/${dewi.running}/early-end`)
        .send({ invoice: 'pay', lastDay: iso(5), reason: 'other', note: NOTE, upcomingPeriods: 'delete' });

    const answers = await Promise.all([send(), send()]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.body).toMatchObject({
      code: 'CONTRACT_ALREADY_ENDED',
      message: 'Kontrak sudah diakhiri',
    });
  });

  // OWASP A01:2025: only an admin ends a contract.
  it('refuses the creator themself', async () => {
    const dewi = await creatorWithRunningPeriod('self');
    const response = await dewi.creator
      .post(`/creators/${dewi.id}/contracts/${dewi.running}/early-end`)
      .send({ invoice: 'cancel', reason: 'other', note: NOTE, upcomingPeriods: 'delete' });

    expect(response.status).toBe(403);
    expect((await prisma.contracts.findUniqueOrThrow({ where: { id: dewi.running } })).original_end_date).toBeNull();
  });

  // The database holds the rule too: an early end is saved whole or not at all.
  it('refuses a half-recorded early end at the database', async () => {
    const dewi = await creatorWithRunningPeriod('check');

    await expect(
      prisma.contracts.update({
        where: { id: dewi.running },
        data: { original_end_date: day(29) },
      }),
    ).rejects.toThrow(/contracts_early_end_check/);
  });
});
