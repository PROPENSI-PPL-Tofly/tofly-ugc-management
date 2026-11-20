import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { H5_BUFFER_DAYS, readableDay } from '../src/creators/evergreen.js';
import { DEFAULT_BUFFER_DAYS } from '../src/creators/new-creator.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { as, signInAsAdmin } from './sessions.js';
import { day } from './days.js';

// PBI-30.2 (AC 8.1.1–8.1.2): Tambah Konten and editing judge a deadline against the window of the
// period the content belongs to — its start plus the buffer up to its end minus H-5 — and not the
// creator's current period, when the creator has a period that has not started.
//
// TEST FIXTURE, NOT PRODUCTION: there is no endpoint yet that gives a creator a second period
// (that is PBI-30.1's). The second period is inserted straight into `contracts` here.

// Rows created here carry this marker so the cleanup never touches anything else.
const MARKER = 'e2e-multi-period-deadlines';

const iso = (offset: number) => day(offset).toISOString().slice(0, 10);

// The current period runs from 30 days ago to 30 days ahead; the next from day 31 to day 120.
const NEXT_START = 31;
const NEXT_END = 120;
/** The next period has not started, so its window opens at its start plus the buffer. */
const NEXT_EARLIEST = NEXT_START + DEFAULT_BUFFER_DAYS;
const NEXT_LATEST = NEXT_END - H5_BUFFER_DAYS;

describe('Deadlines in a period that has not started (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: ReturnType<typeof as>;
  let current: string;
  let next: string;

  function addContent(contractId: string, deadline: number) {
    return admin.post('/contents').send({
      contractId,
      type: 'specific',
      deadline: iso(deadline),
      name: `${MARKER} ${deadline}`,
      brief: 'Brief',
    });
  }

  function scheduled(contractId: string, deadline: number) {
    return prisma.contents.create({
      data: {
        contract_id: contractId,
        type: 'specific',
        name: `${MARKER} edit ${deadline}`,
        brief: 'Brief',
        deadline: day(deadline),
        status: 'scheduled',
      },
    });
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

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-creator@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: 'renewed',
            contracts: {
              create: [
                [-30, 30],
                [NEXT_START, NEXT_END],
              ].map(([start, end]) => ({
                start_date: day(start),
                end_date: day(end),
                contract_type: 'regular' as const,
                days_between: 14,
                content_quota: 4,
                fixed_rate: 100000,
              })),
            },
          },
        },
      },
      include: {
        creators: {
          include: { contracts: { orderBy: { start_date: 'asc' } } },
        },
      },
    });
    [current, next] = user.creators!.contracts.map(({ id }) => id);
  });

  afterAll(async () => {
    // Deleting the creator cascades to its contracts and contents; users go separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  describe('Tambah Konten (AC 8.1.1)', () => {
    it("refuses a deadline before the selected period's start plus the buffer, even one inside the current period", async () => {
      const insideCurrent = await addContent(next, 10);
      const dayBefore = await addContent(next, NEXT_EARLIEST - 1);

      for (const response of [insideCurrent, dayBefore]) {
        expect(response.status).toBe(422);
        expect(response.body.errors).toEqual({
          deadline: `Deadline paling cepat ${readableDay(iso(NEXT_EARLIEST))}`,
        });
      }
    });

    it("refuses a deadline past the selected period's end minus H-5", async () => {
      const response = await addContent(next, NEXT_LATEST + 1);

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual({
        deadline: `Deadline paling lambat ${readableDay(iso(NEXT_LATEST))} (H-5 akhir kontrak)`,
      });
    });

    it('adds content on both edges of the window to the selected period', async () => {
      const first = await addContent(next, NEXT_EARLIEST);
      const last = await addContent(next, NEXT_LATEST);

      expect([first.status, last.status]).toEqual([201, 201]);
      expect([first.body.contractId, last.body.contractId]).toEqual([
        next,
        next,
      ]);
    });
  });

  describe('editing content (AC 8.1.2)', () => {
    it("judges an edited deadline by the content's own period, which has not started", async () => {
      const item = await scheduled(next, NEXT_EARLIEST + 10);

      const intoCurrent = await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: iso(10) });
      const inside = await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: iso(NEXT_EARLIEST) });

      expect(intoCurrent.status).toBe(422);
      expect(intoCurrent.body.errors).toEqual({
        deadline: `Deadline paling cepat ${readableDay(iso(NEXT_EARLIEST))}`,
      });
      expect(inside.status).toBe(200);
    });

    it("keeps judging content of the current period by the current period's window", async () => {
      const item = await scheduled(current, 15);

      const intoNext = await admin
        .patch(`/contents/${item.id}`)
        .send({ deadline: iso(NEXT_EARLIEST) });

      expect(intoNext.status).toBe(422);
      expect(intoNext.body.errors).toEqual({
        deadline: `Deadline paling lambat ${readableDay(iso(30 - H5_BUFFER_DAYS))} (H-5 akhir kontrak)`,
      });
    });

    it('deletes content of a period that has not started', async () => {
      const item = await scheduled(next, NEXT_EARLIEST + 20);

      await admin.delete(`/contents/${item.id}`).expect(204);

      expect(
        await prisma.contents.findUnique({ where: { id: item.id } }),
      ).toBeNull();
    });
  });
});
