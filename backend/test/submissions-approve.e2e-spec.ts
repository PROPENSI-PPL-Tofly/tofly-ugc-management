import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  SubmissionReviewService,
  type SubmissionReviewClient,
} from '../src/submissions/submission-review.service.js';

// Rows created here carry this marker so the cleanup never touches anything else in the
// database, seeded or not.
const MARKER = 'e2e-approve';

type Status =
  'draft_review' | 'draft_revision' | 'draft_revised' | 'draft_approved';

describe('PATCH /submissions/:id/approve (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creatorId: string;
  let contractId: string;

  async function draft(status: Status, handIns = 1) {
    const content = await prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} ${status}`,
        type: 'specific',
        deadline: new Date('2026-10-20T00:00:00.000Z'),
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
            link: `https://drive.example.com/${MARKER}/${i}`,
            created_at: new Date(Date.UTC(2026, 9, 1 + i)),
          },
        }),
      );
    }
    return { contentId: content.id, submissions };
  }

  async function statusOf(contentId: string) {
    const content = await prisma.contents.findUniqueOrThrow({
      where: { id: contentId },
    });
    return content.status;
  }

  function approve(id: string) {
    return request(app.getHttpServer()).patch(`/submissions/${id}/approve`);
  }

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
            first_name: `${MARKER} Dina`,
            contracts: {
              create: {
                start_date: new Date('2026-09-01T00:00:00.000Z'),
                end_date: new Date('2026-12-31T00:00:00.000Z'),
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
  });

  afterAll(async () => {
    // Deleting the creator cascades to its contract, contents and submissions; the user row
    // is not cascaded from the creator, so it goes separately.
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
    await app.close();
  });

  it.each(['draft_review', 'draft_revised'] as const)(
    'approves the latest submission of a draft in %s',
    async (status) => {
      const { contentId, submissions } = await draft(status);

      const response = await approve(submissions[0].id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: submissions[0].id,
        contentId,
        status: 'draft_approved',
      });
      expect(await statusOf(contentId)).toBe('draft_approved');
    },
  );

  it('answers 409 when the same approval is replayed', async () => {
    const { contentId, submissions } = await draft('draft_review');
    await approve(submissions[0].id).expect(200);

    const replay = await approve(submissions[0].id);

    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({ code: 'DRAFT_NOT_REVIEWABLE' });
    expect(await statusOf(contentId)).toBe('draft_approved');
  });

  it('leaves a draft sent back for revision untouched', async () => {
    const { contentId, submissions } = await draft('draft_revision');

    const response = await approve(submissions[0].id);

    expect(response.status).toBe(409);
    expect(await statusOf(contentId)).toBe('draft_revision');
  });

  it('refuses an older submission once the creator resubmitted', async () => {
    const { contentId, submissions } = await draft('draft_revised', 2);

    const response = await approve(submissions[0].id);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'SUBMISSION_SUPERSEDED' });
    expect(await statusOf(contentId)).toBe('draft_revised');
  });

  it('lets exactly one of several racing approvals change the status', async () => {
    const { contentId, submissions } = await draft('draft_review');
    const racers = 5;

    // Hold every racer after its read until all of them have read, so each one sees the
    // draft as still reviewable and only the database-side status guard can stop the rest.
    let arrived = 0;
    let release!: () => void;
    const allRead = new Promise<void>((resolve) => (release = resolve));
    const racing: SubmissionReviewClient = {
      submissions: {
        findUnique: async (args) => {
          const row = await prisma.submissions.findUnique(args);
          arrived += 1;
          if (arrived === racers) release();
          await allRead;
          return row;
        },
      },
      contents: prisma.contents,
    };
    const service = new SubmissionReviewService(racing);

    const results = await Promise.allSettled(
      Array.from({ length: racers }, () => service.approve(submissions[0].id)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const losers = results.filter((r) => r.status === 'rejected');
    expect(losers).toHaveLength(racers - 1);
    for (const loser of losers) {
      expect(loser.reason).toBeInstanceOf(ConflictException);
    }
    expect(await statusOf(contentId)).toBe('draft_approved');
  });

  it('answers 404 for a submission that does not exist', async () => {
    const response = await approve('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await request(app.getHttpServer()).patch(
      `/submissions/${encodeURIComponent("' OR 1=1--")}/approve`,
    );

    expect(response.status).toBe(400);
  });
});
