import { type ExecutionContext, type INestApplication } from '@nestjs/common';
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
  const findImages = vi.fn().mockResolvedValue([]);
  const markSent = vi.fn().mockResolvedValue({ count: 1 });

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
        revision_note_images: {
          findMany: findImages,
          updateMany: markSent,
        },
        users: {
          findUnique: vi.fn().mockResolvedValue({
            email: 'test-admin@example.test',
          }),
        },
        content_events: {
          create: vi.fn().mockResolvedValue({ id: 'event-id' }),
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
      revision_notes_html: 'Mohon perbaiki bagian pembuka.',
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
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<{
            principal?: { userId: string; role: 'admin' };
          }>();
          request.principal = {
            userId: 'test-admin-user-id',
            role: 'admin',
          };
          return true;
        },
      })
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
      contentId,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
      revisionNotesHtml: 'Mohon perbaiki bagian pembuka.',
    });

    expect(contentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: contentId,
        status: {
          in: ['draft_review'],
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
        revision_notes_html: 'Mohon perbaiki bagian pembuka.',
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
      data: {
        revision_notes: 'Mohon perbaiki bagian pembuka.',
        revision_notes_html: 'Mohon perbaiki bagian pembuka.',
      },
    });
  });

  it('sends the note with exactly the images its editor named (review)', async () => {
    const imageId = '22222222-2222-4222-8222-222222222222';
    findImages.mockResolvedValue([{ id: imageId, content_type: 'image/png' }]);

    await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({
        revisionNotes: 'Mohon perbaiki bagian pembuka.',
        imageIds: [imageId],
      })
      .expect(200);

    expect(findImages).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: { in: [imageId] },
        submission_id: submissionId,
        sent_at: null,
      },
      select: { id: true, content_type: true },
    });
    expect(markSent).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: [imageId] }, submission_id: submissionId },
      data: { sent_at: expect.any(Date) },
    });
  });

  it('refuses an image id that is not this note to send (review)', async () => {
    findImages.mockResolvedValue([]);

    const response = await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({
        revisionNotes: 'Mohon perbaiki bagian pembuka.',
        imageIds: ['55555555-5555-4555-8555-555555555555'],
      });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Data revisi tidak valid',
      errors: { imageIds: 'Gambar tidak ditemukan pada catatan ini' },
    });
    expect(markSent).not.toHaveBeenCalled();
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

  it('answers 404 SUBMISSION_NOT_FOUND for an unknown submission, changing nothing', async () => {
    findUnique.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({ revisionNotes: 'Mohon perbaiki bagian pembuka.' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'SUBMISSION_NOT_FOUND',
      message: 'Draft tidak ditemukan',
    });
    expect(submissionUpdate).not.toHaveBeenCalled();
    expect(contentUpdateMany).not.toHaveBeenCalled();
  });

  it('answers 409 DRAFT_NOT_REVIEWABLE for a draft that is already decided, changing nothing', async () => {
    findUnique.mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      contents: {
        status: 'draft_approved',
        submissions: [{ id: submissionId }],
      },
    });

    const response = await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({ revisionNotes: 'Mohon perbaiki bagian pembuka.' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'DRAFT_NOT_REVIEWABLE',
      message: 'Draft ini sudah tidak menunggu keputusan',
    });
    expect(submissionUpdate).not.toHaveBeenCalled();
    expect(contentUpdateMany).not.toHaveBeenCalled();
  });

  it('answers 409 SUBMISSION_SUPERSEDED for an older draft once the creator resubmitted, changing nothing', async () => {
    findUnique.mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      contents: {
        status: 'draft_review',
        submissions: [{ id: '550e8400-e29b-41d4-a716-446655440099' }],
      },
    });

    const response = await request(app.getHttpServer())
      .patch(`/submissions/${submissionId}/revise`)
      .send({ revisionNotes: 'Mohon perbaiki bagian pembuka.' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'SUBMISSION_SUPERSEDED',
      message: 'Creator sudah mengirim draft yang lebih baru',
    });
    expect(submissionUpdate).not.toHaveBeenCalled();
    expect(contentUpdateMany).not.toHaveBeenCalled();
  });
});
