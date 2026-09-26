import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SubmissionsModule } from '../src/submissions/submissions.module.js';

describe('PATCH /submissions/:id/revise', () => {
  let app: INestApplication;

  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const findUnique = vi.fn();
  const submissionUpdate = vi.fn();
  const contentUpdateMany = vi.fn();

  const prisma = {
    submissions: {
      findUnique,
    },

    $transaction: vi.fn(async (callback) =>
      callback({
        submissions: {
          update: submissionUpdate,
        },
        contents: {
          updateMany: contentUpdateMany,
        },
      }),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    findUnique.mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      contents: {
        status: 'draft_review',
        submissions: [
          {
            id: submissionId,
          },
        ],
      },
    });

    submissionUpdate.mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      revision_notes: 'Mohon perbaiki bagian pembuka.',
    });

    contentUpdateMany.mockResolvedValue({
      count: 1,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [SubmissionsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('saves the revision note and removes the draft from review state', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({
        revisionNotes: 'Mohon perbaiki bagian pembuka.',
      });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      id: submissionId,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    expect(contentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: contentId,
        status: {
          in: ['draft_review', 'draft_revised'],
        },
      },
      data: {
        status: 'draft_revision',
      },
    });

    expect(submissionUpdate).toHaveBeenCalledWith({
      where: {
        id: submissionId,
      },
      data: {
        revision_notes: 'Mohon perbaiki bagian pembuka.',
      },
    });
  });
});