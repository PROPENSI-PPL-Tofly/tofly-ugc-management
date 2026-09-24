import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ContentCreationService } from '../src/contents/contents.service.js';

// Use a dedicated disposable database, never the application's DATABASE_URL.
const databaseUrl = process.env.CONTENTS_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run('content allocation with concurrent PostgreSQL transactions', () => {
  let prisma: PrismaClient;
  const users: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.creators.deleteMany({ where: { user_id: { in: users } } });
    await prisma.users.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
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
      const pending = [service.create(input), service.create(input)];
      release();
      await blocker;
      const results = await Promise.allSettled(pending);
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
