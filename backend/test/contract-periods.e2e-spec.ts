import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// Every email created here starts with this marker so the cleanup never touches anything else.
const MARKER = 'e2e-contract-periods';

function iso(offset: number): string {
  return day(offset).toISOString().slice(0, 10);
}

function ddmmyyyy(offset: number): string {
  const [year, month, date] = iso(offset).split('-');
  return `${date}${month}${year}`;
}

/** A second period starting the day after period 1 (which ends in 29 days) ends. */
function periodBody(overrides: Record<string, unknown> = {}) {
  return {
    contractType: 'regular',
    contractStart: iso(30),
    contractEnd: iso(90),
    interval: 14,
    quota: 2,
    fixedRate: 1_750_000,
    deadlines: [iso(49), iso(35)],
    ...overrides,
  };
}

describe('Contract periods (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let adminUserId: string;

  /** A creator whose period 1 runs from 30 days ago to 29 days ahead, with its invoice. */
  async function creatorWithActivePeriod(name: string) {
    const creator = await prisma.creators.create({
      data: {
        first_name: 'Dewi',
        last_name: 'Lestari',
        users: { create: { email: `${MARKER}-${name}@example.com` } },
        contracts: {
          create: {
            start_date: day(-30),
            end_date: day(29),
            contract_type: 'probation',
            days_between: 14,
            content_quota: 1,
            fixed_rate: 1_000_000,
            invoice: { create: {} },
            contents: {
              create: {
                name: 'Evg_1_Dewi Lestari',
                type: 'evergreen',
                deadline: day(10),
              },
            },
          },
        },
      },
      select: { id: true, user_id: true, contracts: { select: { id: true } } },
    });
    return { ...creator, periodOneId: creator.contracts[0].id };
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = as(app, await signInAsAdmin(app, prisma, MARKER));
    adminUserId = (
      await prisma.users.findUniqueOrThrow({
        where: { email: `${MARKER}-signed-in-admin@example.com` },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({
      where: { users: { email: { startsWith: MARKER } } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('adds a period with its own running invoice and Evergreen schedule, leaving period 1 as it was', async () => {
    const creator = await creatorWithActivePeriod('extend');
    const before = await prisma.contracts.findUniqueOrThrow({
      where: { id: creator.periodOneId },
      include: { invoice: true, contents: true },
    });

    const { body } = await admin
      .post(`/creators/${creator.id}/contracts`)
      .send(periodBody())
      .expect(201);

    expect(body).toEqual({
      contractId: expect.any(String),
      invoiceId: expect.any(String),
      startDate: iso(30),
      endDate: iso(90),
      contents: [
        { id: expect.any(String), name: `Evg_1_Dewi Lestari_${ddmmyyyy(35)}`, deadline: iso(35) },
        { id: expect.any(String), name: `Evg_2_Dewi Lestari_${ddmmyyyy(49)}`, deadline: iso(49) },
      ],
    });

    const saved = await prisma.contracts.findUniqueOrThrow({
      where: { id: body.contractId },
      include: {
        invoice: true,
        contents: { include: { content_events: true }, orderBy: { deadline: 'asc' } },
      },
    });
    expect(saved).toMatchObject({
      creator_id: creator.id,
      contract_type: 'regular',
      days_between: 14,
      content_quota: 2,
      invoice: { id: body.invoiceId, status: 'running', snapshot: null },
    });
    expect(Number(saved.fixed_rate)).toBe(1_750_000);
    expect(saved.contents.map((content) => content.content_events)).toEqual([
      [expect.objectContaining({ event_type: 'Scheduled', actor_user_id: adminUserId })],
      [expect.objectContaining({ event_type: 'Scheduled', actor_user_id: adminUserId })],
    ]);

    // [Auditability] the previous contract and invoice stay unchanged.
    await expect(
      prisma.contracts.findUniqueOrThrow({
        where: { id: creator.periodOneId },
        include: { invoice: true, contents: true },
      }),
    ).resolves.toEqual(before);
  });

  it('refuses a period that overlaps the current one, saving nothing', async () => {
    const creator = await creatorWithActivePeriod('overlap');

    const { body } = await admin
      .post(`/creators/${creator.id}/contracts`)
      .send(periodBody({ contractStart: iso(29) }))
      .expect(422);

    expect(body.errors).toEqual({
      contractStart: expect.stringMatching(/^Periode bertabrakan dengan kontrak /),
    });
    await expect(prisma.contracts.count({ where: { creator_id: creator.id } })).resolves.toBe(1);
  });

  it('lets only one of two simultaneous overlapping periods through', async () => {
    const creator = await creatorWithActivePeriod('race');

    const statuses = await Promise.all([
      admin.post(`/creators/${creator.id}/contracts`).send(periodBody()),
      admin.post(`/creators/${creator.id}/contracts`).send(periodBody()),
    ]).then((responses) => responses.map((response) => response.status).sort());

    expect(statuses).toEqual([201, 422]);
    await expect(prisma.contracts.count({ where: { creator_id: creator.id } })).resolves.toBe(2);
  });

  it('edits a period that has not started: the Evergreen schedule is generated again, Specific content stays', async () => {
    const creator = await creatorWithActivePeriod('edit');
    const { body: created } = await admin
      .post(`/creators/${creator.id}/contracts`)
      .send(periodBody())
      .expect(201);
    const specific = await prisma.contents.create({
      data: {
        contract_id: created.contractId,
        name: 'Launch Ramadan',
        type: 'specific',
        deadline: day(40),
      },
    });

    const { body: edited } = await admin
      .put(`/creators/${creator.id}/contracts/${created.contractId}`)
      .send(periodBody({ contractStart: iso(31), quota: 1, deadlines: [iso(37)], fixedRate: 2_000_000 }))
      .expect(200);

    expect(edited).toMatchObject({
      contractId: created.contractId,
      invoiceId: created.invoiceId,
      startDate: iso(31),
      contents: [{ name: `Evg_1_Dewi Lestari_${ddmmyyyy(37)}`, deadline: iso(37) }],
    });
    const contents = await prisma.contents.findMany({
      where: { contract_id: created.contractId },
      orderBy: { deadline: 'asc' },
    });
    expect(contents.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: edited.contents[0].id, type: 'evergreen' },
      { id: specific.id, type: 'specific' },
    ]);
    const saved = await prisma.contracts.findUniqueOrThrow({ where: { id: created.contractId } });
    expect(Number(saved.fixed_rate)).toBe(2_000_000);
    expect(saved.content_quota).toBe(1);
  });

  it('refuses an edit that would leave Specific content outside the period', async () => {
    const creator = await creatorWithActivePeriod('strand');
    const { body: created } = await admin
      .post(`/creators/${creator.id}/contracts`)
      .send(periodBody())
      .expect(201);
    await prisma.contents.create({
      data: { contract_id: created.contractId, name: 'Promo', type: 'specific', deadline: day(80) },
    });

    const { body } = await admin
      .put(`/creators/${creator.id}/contracts/${created.contractId}`)
      .send(periodBody({ contractEnd: iso(70) }))
      .expect(422);

    expect(body.errors).toEqual({ contents: expect.stringMatching(/^Konten "Promo"/) });
    await expect(
      prisma.contents.count({ where: { contract_id: created.contractId, type: 'evergreen' } }),
    ).resolves.toBe(2);
  });

  it('refuses to edit or delete a period that has started', async () => {
    const creator = await creatorWithActivePeriod('started');
    await admin.post(`/creators/${creator.id}/contracts`).send(periodBody()).expect(201);

    const edit = await admin
      .put(`/creators/${creator.id}/contracts/${creator.periodOneId}`)
      .send(periodBody({ contractStart: iso(0), contractEnd: iso(29), deadlines: [iso(6), iso(20)] }))
      .expect(409);
    expect(edit.body).toMatchObject({ code: 'PERIOD_STARTED' });

    const remove = await admin
      .delete(`/creators/${creator.id}/contracts/${creator.periodOneId}`)
      .expect(409);
    expect(remove.body).toMatchObject({ code: 'PERIOD_STARTED' });
  });

  it('deletes a period that has not started, with its schedule and empty invoice', async () => {
    const creator = await creatorWithActivePeriod('delete');
    const { body: created } = await admin
      .post(`/creators/${creator.id}/contracts`)
      .send(periodBody())
      .expect(201);

    await admin.delete(`/creators/${creator.id}/contracts/${created.contractId}`).expect(204);

    await expect(prisma.contracts.findUnique({ where: { id: created.contractId } })).resolves.toBeNull();
    await expect(prisma.invoices.findUnique({ where: { id: created.invoiceId } })).resolves.toBeNull();
    await expect(prisma.contents.count({ where: { contract_id: created.contractId } })).resolves.toBe(0);
    await expect(prisma.contracts.count({ where: { creator_id: creator.id } })).resolves.toBe(1);
  });

  it("refuses to delete a creator's only period, even before it starts", async () => {
    const creator = await prisma.creators.create({
      data: {
        first_name: 'Bayu',
        users: { create: { email: `${MARKER}-only@example.com` } },
        contracts: {
          create: {
            start_date: day(10),
            end_date: day(60),
            contract_type: 'regular',
            days_between: 7,
            content_quota: 1,
            fixed_rate: 500_000,
          },
        },
      },
      select: { id: true, contracts: { select: { id: true } } },
    });

    const { body } = await admin
      .delete(`/creators/${creator.id}/contracts/${creator.contracts[0].id}`)
      .expect(409);

    expect(body).toMatchObject({ code: 'LAST_PERIOD' });
  });

  it("answers 404 for another creator's period, and changes nothing there", async () => {
    const owner = await creatorWithActivePeriod('owner');
    const other = await creatorWithActivePeriod('other');
    const { body: created } = await admin
      .post(`/creators/${owner.id}/contracts`)
      .send(periodBody())
      .expect(201);

    await admin
      .put(`/creators/${other.id}/contracts/${created.contractId}`)
      .send(periodBody({ fixedRate: 1 }))
      .expect(404);
    await admin.delete(`/creators/${other.id}/contracts/${created.contractId}`).expect(404);

    const saved = await prisma.contracts.findUniqueOrThrow({ where: { id: created.contractId } });
    expect(Number(saved.fixed_rate)).toBe(1_750_000);
  });

  it('answers 404 for a creator that does not exist and 400 for a malformed id', async () => {
    await admin
      .post('/creators/00000000-0000-4000-8000-000000000000/contracts')
      .send(periodBody())
      .expect(404);
    await admin.post('/creators/not-a-uuid/contracts').send(periodBody()).expect(400);
    await admin.delete('/creators/00000000-0000-4000-8000-000000000000/contracts/1').expect(400);
  });

  it('is closed to creators and to requests that are not signed in', async () => {
    const creator = await creatorWithActivePeriod('self');
    const asCreator = as(
      app,
      await signIn(app, { userId: creator.user_id, role: 'creator', creatorId: creator.id }),
    );

    await asCreator.post(`/creators/${creator.id}/contracts`).send(periodBody()).expect(403);
    await as(app, '').post(`/creators/${creator.id}/contracts`).send(periodBody()).expect(401);
    await expect(prisma.contracts.count({ where: { creator_id: creator.id } })).resolves.toBe(1);
  });
});
