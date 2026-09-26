import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, and every request searches for it so seeded drafts stay out of the assertions.
const MARKER = 'e2e-queue';

const DAY = 24 * 60 * 60 * 1000;

/** A calendar day relative to today, as Postgres `date` columns store it. */
function daysFromToday(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      days * DAY,
  );
}

type Status =
  | 'scheduled'
  | 'draft_review'
  | 'draft_revision'
  | 'draft_revised'
  | 'draft_approved';

describe('GET /submissions?status=review (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creatorId: string;
  let contractId: string;

  async function draft(
    name: string,
    status: Status,
    deadline: Date,
    handIns: number,
    type: 'evergreen' | 'specific' = 'specific',
  ) {
    const content = await prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${name}`,
        type,
        deadline,
        status,
      },
    });
    const submissions = [];
    for (let i = 0; i < handIns; i++) {
      submissions.push(
        await prisma.submissions.create({
          data: {
            content_id: content.id,
            creator_id: creatorId,
            link: `https://drive.example.com/${MARKER}/${name}/${i}`,
            created_at: new Date(Date.UTC(2026, 8, 1 + i)),
          },
        }),
      );
    }
    return submissions;
  }

  function queue(query = '') {
    return request(app.getHttpServer()).get(
      `/submissions?status=review&q=${MARKER}${query}`,
    );
  }

  let reviewSoon: { id: string }[];
  let resubmitLate: { id: string }[];
  let overdue: { id: string }[];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const user = await prisma.users.create({
      data: {
        email: `${MARKER}-creator@example.com`,
        creators: {
          create: {
            first_name: MARKER,
            last_name: 'Dina',
            contracts: {
              create: {
                start_date: daysFromToday(-60),
                end_date: daysFromToday(120),
                contract_type: 'regular',
                days_between: 14,
                content_quota: 8,
                fixed_rate: 100000,
              },
            },
          },
        },
      },
      include: { creators: { include: { contracts: true } } },
    });
    creatorId = user.creators!.id;
    contractId = user.creators!.contracts[0].id;

    reviewSoon = await draft(
      'review soon',
      'draft_review',
      daysFromToday(10),
      1,
      'evergreen',
    );
    resubmitLate = await draft(
      'resubmit late',
      'draft_revised',
      daysFromToday(60),
      2,
    );
    overdue = await draft('overdue', 'draft_review', daysFromToday(-3), 1);
    await draft('waiting on creator', 'draft_revision', daysFromToday(5), 1);
    await draft('approved', 'draft_approved', daysFromToday(5), 1);
    await draft('not handed in', 'scheduled', daysFromToday(5), 0);
  });

  afterAll(async () => {
    // Deleting the creator cascades to its contract, contents and submissions; the user row
    // is not cascaded from the creator, so it goes separately.
    await prisma.creators.deleteMany({ where: { first_name: MARKER } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it('lists only drafts waiting for a decision, resubmits first, then nearest deadline', async () => {
    const response = await queue();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          submissionId: resubmitLate[1].id,
          creatorName: `${MARKER} Dina`,
          contentName: `${MARKER} resubmit late`,
          type: 'specific',
          deadline: daysFromToday(60).toISOString().slice(0, 10),
          status: 'draft_revised',
        },
        {
          submissionId: overdue[0].id,
          creatorName: `${MARKER} Dina`,
          contentName: `${MARKER} overdue`,
          type: 'specific',
          deadline: daysFromToday(-3).toISOString().slice(0, 10),
          status: 'draft_review',
        },
        {
          submissionId: reviewSoon[0].id,
          creatorName: `${MARKER} Dina`,
          contentName: `${MARKER} review soon`,
          type: 'evergreen',
          deadline: daysFromToday(10).toISOString().slice(0, 10),
          status: 'draft_review',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });
  });

  it.each([
    ['overdue=true', `${MARKER} overdue`],
    ['filterStatus=draft_revised', `${MARKER} resubmit late`],
    ['type=evergreen', `${MARKER} review soon`],
  ])('narrows the queue with %s', async (filter, contentName) => {
    const response = await queue(`&${filter}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.map(
        (item: { contentName: string }) => item.contentName,
      ),
    ).toEqual([contentName]);
  });

  it('pages the queue', async () => {
    const response = await queue('&pageSize=2&page=2');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.total).toBe(3);
    expect(response.body.totalPages).toBe(2);
  });

  it('answers 400 when the queue is not named', async () => {
    const response = await request(app.getHttpServer()).get('/submissions');

    expect(response.status).toBe(400);
  });

  it('hands out a submission id that approve accepts, after which the draft leaves the queue', async () => {
    const approved = await request(app.getHttpServer()).patch(
      `/submissions/${resubmitLate[1].id}/approve`,
    );
    expect(approved.status).toBe(200);

    const response = await queue();
    expect(
      response.body.items.map(
        (item: { submissionId: string }) => item.submissionId,
      ),
    ).toEqual([overdue[0].id, reviewSoon[0].id]);
  });
});
