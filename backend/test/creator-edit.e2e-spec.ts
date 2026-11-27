import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaWhitelistResolver } from '../src/auth/google/prisma-whitelist-resolver.js';
import { normalizeVideoLink } from '../src/contents/content-links.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { day } from './days.js';
import { as, signIn, signInAsAdmin } from './sessions.js';

// Every email created here starts with this marker so the cleanup never touches anything else.
const MARKER = 'e2e-creator-edit';

function iso(offset: number): string {
  return day(offset).toISOString().slice(0, 10);
}

describe('Ubah Data (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let adminUserId: string;
  let sequence = 0;

  /** A creator with a finalized period, one that runs for 29 more days and one that follows it. */
  async function makeCreator() {
    sequence += 1;
    const email = `${MARKER}-${sequence}@example.com`;
    const creator = await prisma.creators.create({
      data: {
        first_name: 'Salsa',
        last_name: 'Amelia',
        users: { create: { email } },
        social_accounts: {
          create: { platform: 'instagram', username: 'salsa.ig' },
        },
        contracts: {
          create: [
            {
              start_date: day(-120),
              end_date: day(-31),
              contract_type: 'probation',
              days_between: 14,
              content_quota: 1,
              fixed_rate: 1_000_000,
              invoice: {
                create: {
                  status: 'finalized',
                  finalized_at: day(-20),
                  snapshot: {},
                },
              },
            },
            {
              start_date: day(-30),
              end_date: day(29),
              contract_type: 'probation',
              days_between: 14,
              content_quota: 2,
              fixed_rate: 1_000_000,
              contents: {
                create: [
                  { name: 'Evg_1', type: 'evergreen', deadline: day(10) },
                  { name: 'Evg_2', type: 'evergreen', deadline: day(20) },
                ],
              },
            },
            {
              start_date: day(60),
              end_date: day(120),
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
    const [past, running, next] = creator.contracts.map(({ id }) => id);
    return {
      id: creator.id,
      userId: creator.user_id,
      email,
      past,
      running,
      next,
    };
  }

  function patch(creatorId: string, body: object) {
    return admin.patch(`/creators/${creatorId}`).send(body);
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
    await prisma.email_log.deleteMany({
      where: { recipient: { startsWith: MARKER } },
    });
    await prisma.creators.deleteMany({
      where: { users: { email: { startsWith: MARKER } } },
    });
    await prisma.login_codes.deleteMany({
      where: { email: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  // OWASP A01.
  it('is closed to visitors, creators and other origins', async () => {
    const salsa = await makeCreator();
    const url = `/creators/${salsa.id}`;
    const asCreator = as(
      app,
      await signIn(app, {
        userId: salsa.userId,
        role: 'creator',
        creatorId: salsa.id,
      }),
    );

    expect(
      (await as(app, 'other=1').patch(url).send({ name: 'X' })).status,
    ).toBe(401);
    expect((await asCreator.patch(url).send({ name: 'X' })).status).toBe(403);
    expect(
      (
        await admin
          .patch(url)
          .set('Origin', 'https://evil.example')
          .set('Sec-Fetch-Site', 'cross-site')
          .send({ name: 'X' })
      ).status,
    ).toBe(403);
    expect((await admin.patch('/creators/not-a-uuid').send({})).status).toBe(
      400,
    );

    const stored = await prisma.creators.findUniqueOrThrow({
      where: { id: salsa.id },
    });
    expect(stored.first_name).toBe('Salsa');
  });

  it('saves every field of the form in one request', async () => {
    const salsa = await makeCreator();
    const { body } = await patch(salsa.id, {
      name: 'Salsa Putri Amelia',
      email: `${MARKER}-all-new@example.com`,
      instagramUsername: 'salsa.baru',
      tiktokUsername: 'salsa.tt',
      contractId: salsa.running,
      contractType: 'regular',
      fixedRate: 1_500_000,
      contractEnd: iso(45),
      quota: 4,
    }).expect(200);

    expect(body.id).toBe(salsa.id);
    expect([...body.changed].sort()).toEqual([
      'contractEnd',
      'contractType',
      'email',
      'fixedRate',
      'instagramUsername',
      'name',
      'quota',
      'tiktokUsername',
    ]);

    const { body: detail } = await admin
      .get(`/creators/${salsa.id}`)
      .expect(200);
    expect(detail).toMatchObject({
      name: 'Salsa Putri Amelia',
      email: `${MARKER}-all-new@example.com`,
      socials: { instagram: 'salsa.baru', tiktok: 'salsa.tt' },
      usernameLocks: { instagram: null, tiktok: null },
      contract: { endDate: iso(45), contentQuota: 4, type: 'regular' },
      // PBI-16: the two new slots are owed before they are scheduled.
      progress: { submitted: 0, total: 4, percent: 0 },
    });
    expect(detail.contractHistory[1]).toMatchObject({
      fixedRate: 1_500_000,
      evergreenCount: 2,
      remainingEvergreenQuota: 2,
      invoiceStatus: 'running',
    });
    // The contents and their deadlines stay as they were.
    const contents = await prisma.contents.findMany({
      where: { contract_id: salsa.running },
      orderBy: { deadline: 'asc' },
    });
    expect(contents.map(({ name, deadline }) => [name, deadline])).toEqual([
      ['Evg_1', day(10)],
      ['Evg_2', day(20)],
    ]);
  });

  // OWASP A01: what the form does not hold cannot be written through it.
  it('ignores fields the form does not have', async () => {
    const salsa = await makeCreator();
    await patch(salsa.id, {
      name: 'Rani',
      is_admin: true,
      user_id: adminUserId,
      contractStart: iso(0),
    }).expect(200);
    const user = await prisma.users.findUniqueOrThrow({
      where: { id: salsa.userId },
    });
    expect(user.is_admin).toBe(false);
  });

  it('refuses another creator’s contract as if it did not exist', async () => {
    const salsa = await makeCreator();
    const other = await makeCreator();
    const { body } = await patch(salsa.id, {
      contractId: other.running,
      fixedRate: 5,
    }).expect(404);
    expect(body.code).toBe('PERIOD_NOT_FOUND');
    const stored = await prisma.contracts.findUniqueOrThrow({
      where: { id: other.running },
    });
    expect(stored.fixed_rate.toNumber()).toBe(1_000_000);
  });

  // OWASP A07.
  it('ends the creator’s sessions and codes on a new email, which alone signs in afterwards', async () => {
    const salsa = await makeCreator();
    const creator = as(
      app,
      await signIn(app, {
        userId: salsa.userId,
        role: 'creator',
        creatorId: salsa.id,
      }),
    );
    expect((await creator.get('/me/invoices')).status).toBe(200);
    await prisma.login_codes.create({
      data: {
        email: salsa.email,
        code_hash: 'a'.repeat(64),
        expires_at: new Date(Date.now() + 600_000),
      },
    });

    const email = `${MARKER}-renamed@example.com`;
    await patch(salsa.id, { email }).expect(200);

    expect((await creator.get('/me/invoices')).status).toBe(401);
    expect(
      await prisma.login_codes.count({ where: { email: salsa.email } }),
    ).toBe(0);
    const whitelist = new PrismaWhitelistResolver(prisma);
    expect(await whitelist.resolve(salsa.email)).toBeNull();
    expect(await whitelist.resolve(email)).toMatchObject({
      role: 'creator',
      creatorId: salsa.id,
    });
  });

  it('refuses an email already in use, whatever its case, and saves nothing of that edit', async () => {
    const salsa = await makeCreator();
    const other = await makeCreator();
    const { body } = await patch(salsa.id, {
      name: 'Rani',
      email: other.email.toUpperCase(),
    }).expect(422);
    expect(body.errors).toEqual({ email: 'Email sudah terdaftar' });
    const stored = await prisma.creators.findUniqueOrThrow({
      where: { id: salsa.id },
    });
    expect(stored.first_name).toBe('Salsa');
  });

  it('locks a username once a link is submitted on its platform or its account is connected', async () => {
    const salsa = await makeCreator();
    await prisma.contents.updateMany({
      where: { contract_id: salsa.running, name: 'Evg_1' },
      data: { status: 'link_submitted', video_submitted_at: day(0) },
    });
    const content = await prisma.contents.findFirstOrThrow({
      where: { contract_id: salsa.running, name: 'Evg_1' },
    });
    const url = `https://www.tiktok.com/@salsa/video/${Date.now()}${sequence}`;
    await prisma.content_links.create({
      data: {
        content_id: content.id,
        platform: 'tiktok',
        url,
        normalized_url: normalizeVideoLink(url),
        submitted_at: day(0),
        submitted_by: salsa.userId,
      },
    });
    await prisma.social_accounts.updateMany({
      where: { creator_id: salsa.id },
      data: {
        is_connected: true,
        platform_user_id: `${MARKER}-${sequence}`,
        connected_at: new Date(),
      },
    });

    const { body: detail } = await admin
      .get(`/creators/${salsa.id}`)
      .expect(200);
    expect(detail.usernameLocks).toEqual({
      instagram: 'connected',
      tiktok: 'link_submitted',
    });
    for (const edit of [{ instagramUsername: 'x' }, { tiktokUsername: 'x' }]) {
      const { body } = await patch(salsa.id, edit).expect(409);
      expect(body.code).toBe('USERNAME_LOCKED');
    }
  });

  it('clears and adds optional usernames', async () => {
    const salsa = await makeCreator();
    await patch(salsa.id, {
      instagramUsername: '',
      tiktokUsername: 'salsa.tt',
    }).expect(200);
    const { body } = await admin.get(`/creators/${salsa.id}`).expect(200);
    expect(body.socials).toEqual({ tiktok: 'salsa.tt' });
  });

  it('recalculates the running invoice at once and tells the change in its Aktivitas', async () => {
    const salsa = await makeCreator();
    const invoice = `/invoices/${salsa.id}?contract=${salsa.running}`;
    const before = (await admin.get(invoice).expect(200)).body;

    await patch(salsa.id, {
      contractId: salsa.running,
      fixedRate: 1_500_000,
    }).expect(200);

    const after = (await admin.get(invoice).expect(200)).body;
    expect(before.components.fixedRate.amount).toBe(1_000_000);
    expect(before.rateChanges).toEqual([]);
    expect(after.components.fixedRate.amount).toBe(1_500_000);
    expect(after.rateChanges).toEqual([
      {
        id: expect.any(String),
        oldRate: 1_000_000,
        newRate: 1_500_000,
        actorName: `${MARKER}-signed-in-admin@example.com`,
        createdAt: expect.any(String),
      },
    ]);

    const creator = as(
      app,
      await signIn(app, {
        userId: salsa.userId,
        role: 'creator',
        creatorId: salsa.id,
      }),
    );
    const mine = (
      await creator.get('/me/invoices').expect(200)
    ).body.items.find(
      (item: { contract: { id: string } }) =>
        item.contract.id === salsa.running,
    );
    expect(mine.rateChanges).toEqual([
      {
        id: expect.any(String),
        oldRate: 1_000_000,
        newRate: 1_500_000,
        createdAt: expect.any(String),
      },
    ]);
  });

  it('keeps a fixed rate whose invoice is no longer running', async () => {
    const salsa = await makeCreator();
    const { body } = await patch(salsa.id, {
      contractId: salsa.past,
      fixedRate: 2,
    }).expect(409);
    expect(body.code).toBe('FIXED_RATE_LOCKED');
    // The type stays editable on the same period (AC 2).
    await patch(salsa.id, {
      contractId: salsa.past,
      contractType: 'regular',
    }).expect(200);
  });

  // OWASP A04: a Finalize holding the contract wins; the edit judges what it left.
  it('waits for a Finalize in progress and then refuses the rate', async () => {
    const salsa = await makeCreator();
    let edit: Promise<request.Response> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${salsa.running}::uuid FOR UPDATE`;
      edit = patch(salsa.id, { contractId: salsa.running, fixedRate: 9 }).then(
        (answer) => answer,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tx.invoices.create({
        data: {
          contract_id: salsa.running,
          status: 'finalized',
          finalized_at: new Date(),
          snapshot: {},
        },
      });
    });
    expect((await edit!).body.code).toBe('FIXED_RATE_LOCKED');
  });

  it('moves the end of the active period everywhere it is read, up to the next period', async () => {
    const salsa = await makeCreator();
    const refused = await patch(salsa.id, {
      contractId: salsa.running,
      contractEnd: iso(60),
    }).expect(422);
    expect(refused.body.errors.contractEnd).toContain(
      'sehari sebelum Periode 3 mulai',
    );

    await patch(salsa.id, {
      contractId: salsa.running,
      contractEnd: iso(59),
    }).expect(200);
    const invoice = (
      await admin
        .get(`/invoices/${salsa.id}?contract=${salsa.running}`)
        .expect(200)
    ).body;
    expect(invoice.contract).toMatchObject({
      endDate: iso(59),
      lastDay: iso(59),
      status: 'active',
    });

    const earlier = await patch(salsa.id, {
      contractId: salsa.running,
      contractEnd: iso(40),
    }).expect(422);
    expect(earlier.body.errors.contractEnd).toContain('hanya bisa dimundurkan');
  });

  it('opens Tambah Konten for the slots a raised quota adds, up to the new end', async () => {
    const salsa = await makeCreator();
    const schedule = (deadline: string) =>
      admin
        .post('/contents')
        .send({ contractId: salsa.running, type: 'evergreen', deadline });
    const full = await schedule(iso(20));
    expect(full.body.errors).toEqual({ type: 'Slot Evergreen sudah penuh' });

    await patch(salsa.id, {
      contractId: salsa.running,
      quota: 3,
      contractEnd: iso(50),
    }).expect(200);
    const added = await schedule(iso(45));
    expect([added.status, added.body]).toEqual([201, expect.anything()]);
  });

  // PBI-16 (QA): the creator is told about a new end date and quota; the edit was wired to a
  // stand-in that sent nothing.
  it('emails the creator the new end date and the new quota, once each', async () => {
    const salsa = await makeCreator();

    await patch(salsa.id, {
      contractId: salsa.running,
      quota: 3,
      contractEnd: iso(50),
    }).expect(200);
    await patch(salsa.id, {
      contractId: salsa.running,
      quota: 3,
      contractEnd: iso(50),
    }).expect(200);

    const emails = await prisma.email_log.findMany({
      where: { payload: { path: ['contractId'], equals: salsa.running } },
      select: { event_key: true, template: true },
      orderBy: { template: 'asc' },
    });
    expect(emails).toEqual([
      {
        event_key: `contract_end_changed:${salsa.running}:${iso(50)}`,
        template: 'contract_end_changed',
      },
      {
        event_key: `quota_changed:${salsa.running}:3`,
        template: 'quota_changed',
      },
    ]);
  });

  it('refuses a quota below the Evergreen content there', async () => {
    const salsa = await makeCreator();
    const { body } = await patch(salsa.id, {
      contractId: salsa.running,
      quota: 1,
    }).expect(422);
    expect(body.errors).toEqual({
      quota: 'Minimal 2, sesuai konten Evergreen yang sudah ada',
    });
  });

  it.each(['past', 'next'] as const)(
    'keeps the end and quota of a %s period',
    async (which) => {
      const salsa = await makeCreator();
      for (const edit of [{ quota: 9 }, { contractEnd: iso(200) }]) {
        const { body } = await patch(salsa.id, {
          contractId: salsa[which],
          ...edit,
        }).expect(409);
        expect(body.code).toBe('PERIOD_NOT_ACTIVE');
      }
    },
  );

  it('saves one of two edits of the same rate after the other, both in the history', async () => {
    const salsa = await makeCreator();
    const answers = await Promise.all([
      patch(salsa.id, { contractId: salsa.running, fixedRate: 2_000_000 }),
      patch(salsa.id, { contractId: salsa.running, fixedRate: 3_000_000 }),
    ]);
    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
    const history = await prisma.invoice_rate_changes.findMany({
      where: { invoices: { contract_id: salsa.running } },
    });
    expect(history).toHaveLength(2);
    // The second starts from what the first left, not from the rate both read before.
    const rates = history.map((row) => [
      row.old_rate.toNumber(),
      row.new_rate.toNumber(),
    ]);
    const first = rates.find(([old]) => old === 1_000_000)!;
    expect(rates.find(([old]) => old === first[1])).toBeDefined();
  });
});
