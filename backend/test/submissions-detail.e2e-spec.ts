import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const MARKER = 'e2e-detail';

describe('GET /submissions/:id (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creatorId: string;
  let contractId: string;

  async function createDraft() {
    const content = await prisma.contents.create({
      data: {
        contract_id: contractId,
        name: `${MARKER} draft`,
        type: 'specific',
        brief: 'Create a short product review',
        deadline: new Date('2026-10-20T00:00:00.000Z'),
        status: 'draft_revised',
      },
    });

    const firstSubmission = await prisma.submissions.create({
      data: {
        content_id: content.id,
        creator_id: creatorId,
        link: `https://drive.example.com/${MARKER}/first`,
        revision_notes: null,
        created_at: new Date('2026-09-01T00:00:00.000Z'),
        updated_at: new Date('2026-09-20T00:00:00.000Z'),
      },
    });

    const latestSubmission = await prisma.submissions.create({
      data: {
        content_id: content.id,
        creator_id: creatorId,
        link: `https://drive.example.com/${MARKER}/latest`,
        revision_notes: 'Tolong ubah opening',
        created_at: new Date('2026-09-05T00:00:00.000Z'),
        updated_at: new Date('2026-09-21T00:00:00.000Z'),
      },
    });

    return {
      contentId: content.id,
      firstSubmission,
      latestSubmission,
    };
  }

  function getDetail(id: string) {
    return request(app.getHttpServer()).get(`/submissions/${id}`);
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
      include: {
        creators: {
          include: {
            contracts: true,
          },
        },
      },
    });

    creatorId = user.creators!.id;
    contractId = user.creators!.contracts[0].id;
  });

  afterAll(async () => {
    await prisma.creators.deleteMany({
      where: {
        first_name: {
          startsWith: MARKER,
        },
      },
    });

    await prisma.users.deleteMany({
      where: {
        email: {
          startsWith: MARKER,
        },
      },
    });

    await app.close();
  });

  it('returns the current submission detail and revision history with notes only', async () => {
    const { contentId, latestSubmission } = await createDraft();

    const response = await getDetail(latestSubmission.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      contentName: `${MARKER} draft`,
      creatorName: `${MARKER} Dina`,
      deadline: '2026-10-20',
      type: 'specific',
      brief: 'Create a short product review',
      link: `https://drive.example.com/${MARKER}/latest`,
      status: 'draft_revised',
      revisionHistory: [
        {
          note: 'Tolong ubah opening',
          date: '2026-09-21T00:00:00.000Z',
        },
      ],
    });

    const revisionRows = await prisma.submissions.findMany({
      where: {
        content_id: contentId,
        revision_notes: {
          not: null,
        },
      },
      orderBy: {
        updated_at: 'asc',
      },
      select: {
        revision_notes: true,
        created_at: true,
        updated_at: true,
      },
    });

    expect(revisionRows).toHaveLength(1);
    expect(revisionRows[0].revision_notes).toBe('Tolong ubah opening');
    expect(revisionRows[0].created_at.toISOString()).toBe(
      '2026-09-05T00:00:00.000Z',
    );
    expect(revisionRows[0].updated_at.toISOString()).toBe(
      '2026-09-21T00:00:00.000Z',
    );
  });

  it('answers 404 for a submission that does not exist', async () => {
    const response = await getDetail('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'SUBMISSION_NOT_FOUND',
    });
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await getDetail(encodeURIComponent("' OR 1=1--"));

    expect(response.status).toBe(400);
  });
});
