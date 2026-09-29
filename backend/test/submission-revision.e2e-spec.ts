import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../src/auth/admin.guard.js';
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
      // Prisma is stubbed here, so there is no session table to sign in against; the admin
      // guard is proven by admin-routes.e2e-spec.ts on the real database.
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
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

  it('stores the note without the spaces around it', async () => {
    await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({ revisionNotes: '  Mohon perbaiki bagian pembuka.  ' })
      .expect(200);

    expect(submissionUpdate).toHaveBeenCalledWith({
      where: { id: submissionId },
      data: { revision_notes: 'Mohon perbaiki bagian pembuka.' },
    });
  });

  it('refuses a note over 1000 characters with 422, changing nothing', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({ revisionNotes: 'a'.repeat(1001) });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Data revisi tidak valid',
      errors: { revisionNotes: 'Catatan revisi maksimal 1000 karakter' },
    });
    expect(submissionUpdate).not.toHaveBeenCalled();
    expect(contentUpdateMany).not.toHaveBeenCalled();
  });
});
