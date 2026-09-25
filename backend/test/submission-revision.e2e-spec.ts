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
  const contentUpdate = vi.fn();

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
          update: contentUpdate,
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
      },
    });

    submissionUpdate.mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      revision_notes: 'Mohon perbaiki bagian pembuka.',
    });

    contentUpdate.mockResolvedValue({
      id: contentId,
      status: 'draft_revision',
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

    expect(submissionUpdate).toHaveBeenCalledWith({
      where: {
        id: submissionId,
      },
      data: {
        revision_notes: 'Mohon perbaiki bagian pembuka.',
      },
    });

    expect(contentUpdate).toHaveBeenCalledWith({
      where: {
        id: contentId,
      },
      data: {
        status: 'draft_revision',
      },
    });
  });
});
