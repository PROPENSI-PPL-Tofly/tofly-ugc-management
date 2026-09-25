import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ContentsController } from '../src/contents/contents.controller.js';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ContentCreationService } from '../src/contents/contents.service.js';

// Use a dedicated disposable database, never the application's DATABASE_URL.
const databaseUrl = process.env.CONTENTS_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run('content allocation with concurrent PostgreSQL transactions', () => {
  let prisma: PrismaClient;
  const users: string[] = [];
  let app: INestApplication;
  let contractId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
    const service = new ContentCreationService(prisma, {
      today: () => new Date('2026-09-24Z'),
      bufferDays: async () => 5,
    });
    const module = await Test.createTestingModule({
      controllers: [ContentsController],
      providers: [{ provide: ContentCreationService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    const user = await prisma.users.create({
      data: { email: `http-${randomUUID()}@example.com` },
    });
    users.push(user.id);
    const creator = await prisma.creators.create({
      data: { user_id: user.id, first_name: 'HTTP' },
    });
    const contract = await prisma.contracts.create({
      data: {
        creator_id: creator.id,
        start_date: new Date('2026-09-01Z'),
        end_date: new Date('2026-12-31Z'),
        content_quota: 1,
        days_between: 7,
        fixed_rate: 0,
        contract_type: 'regular',
      },
    });
    contractId = contract.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (users.length > 0) {
      await prisma.creators.deleteMany({ where: { user_id: { in: users } } });
      await prisma.users.deleteMany({ where: { id: { in: users } } });
    }
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it('saves Specific through HTTP, ignoring client-controlled server fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/contents')
      .send({
        contractId,
        type: 'specific',
        deadline: '2026-10-10',
        name: 'Campaign',
        brief: 'Brief',
        status: 'draft_approved',
        is_proposal: true,
        id: randomUUID(),
      })
      .expect(201);
    expect(response.body).toMatchObject({
      contractId,
      type: 'specific',
      name: 'Campaign',
      status: 'scheduled',
      deadline: '2026-10-10',
    });
    const saved = await prisma.contents.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(saved).toMatchObject({
      status: 'scheduled',
      is_proposal: false,
      brief: 'Brief',
    });
  });

  it('generates the Evergreen title and rejects the next item once quota is full', async () => {
    const body = {
      contractId,
      type: 'evergreen',
      deadline: '2026-10-10',
      name: 'Forged title',
    };
    const first = await request(app.getHttpServer())
      .post('/contents')
      .send(body)
      .expect(201);
    expect(first.body).toMatchObject({
      name: 'Evg_1_HTTP_10102026',
      brief: '',
      status: 'scheduled',
    });
    const rejected = await request(app.getHttpServer())
      .post('/contents')
      .send(body)
      .expect(422);
    expect(rejected.body.errors).toEqual({
      type: 'Slot Evergreen sudah penuh',
    });
    expect(
      await prisma.contents.count({
        where: { contract_id: contractId, type: 'evergreen' },
      }),
    ).toBe(1);
  });

  it('returns Specific field errors without writing any data', async () => {
    const before = await prisma.contents.count({
      where: { contract_id: contractId },
    });
    const response = await request(app.getHttpServer())
      .post('/contents')
      .send({ contractId, type: 'specific', deadline: '2026-10-10' })
      .expect(422);
    expect(response.body.errors).toEqual({
      name: 'Nama konten wajib diisi',
      brief: 'Brief wajib diisi',
    });
    expect(
      await prisma.contents.count({ where: { contract_id: contractId } }),
    ).toBe(before);
  });

  it('uses SCRUM-103 buffer errors through HTTP and rejects a missing contract', async () => {
    const body = {
      contractId,
      type: 'specific',
      name: 'Campaign',
      brief: 'Brief',
      deadline: '2026-09-28',
    };
    const response = await request(app.getHttpServer())
      .post('/contents')
      .send(body)
      .expect(422);
    expect(response.body.errors).toEqual({
      deadline: 'Deadline paling cepat 2026-09-29',
    });
    await request(app.getHttpServer())
      .post('/contents')
      .send({ ...body, contractId: randomUUID() })
      .expect(404);
  });

  it.each([1, 2])(
    'keeps quota and sequence consistent with %i slots left',
    async (quota) => {
      const user = await prisma.users.create({
        data: { email: `concurrency-${randomUUID()}@example.com` },
      });
      users.push(user.id);
      const creator = await prisma.creators.create({
        data: { user_id: user.id, first_name: 'Concurrency' },
      });
      const contract = await prisma.contracts.create({
        data: {
          creator_id: creator.id,
          start_date: new Date('2026-09-01Z'),
          end_date: new Date('2026-12-31Z'),
          content_quota: quota,
          days_between: 7,
          fixed_rate: 0,
          contract_type: 'regular',
        },
      });
      const service = new ContentCreationService(prisma, {
        today: () => new Date('2026-09-24Z'),
        bufferDays: async () => 5,
      });
      // Hold the same row first so both service calls queue behind a real DB lock.
      let release!: () => void;
      let locked!: () => void;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contract.id}::uuid FOR UPDATE`;
        locked();
        await gate;
      });
      await Promise.race([ready, blocker]);
      const input = {
        contractId: contract.id,
        type: 'evergreen' as const,
        deadline: '2026-10-10',
      };
      const pending = Promise.allSettled([
        service.create(input),
        service.create(input),
      ]);
      try {
        // Prove real contention rather than merely starting two promises together.
        await vi.waitFor(
          async () => {
            const [waiting] = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE '%FOR UPDATE%'
          `;
            expect(waiting.count).toBeGreaterThanOrEqual(2);
          },
          { timeout: 2000, interval: 25 },
        );
      } finally {
        release();
        await blocker;
        await pending;
      }
      const results = await pending;
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(quota);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toMatchObject({
            status: 422,
            response: { errors: { type: expect.any(String) } },
          });
        }
      }
      const saved = await prisma.contents.findMany({
        where: { contract_id: contract.id },
        orderBy: { name: 'asc' },
      });
      expect(saved.map((content) => content.name)).toEqual(
        Array.from(
          { length: quota },
          (_, index) => `Evg_${index + 1}_Concurrency_10102026`,
        ),
      );
    },
  );
});
