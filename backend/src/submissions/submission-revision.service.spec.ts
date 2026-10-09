import { ConflictException, NotFoundException } from '@nestjs/common';
import { SubmissionRevisionService } from './submission-revision.service.js';

describe('SubmissionRevisionService', () => {
  it('stores the revision note and changes a review submission to draft_revision', async () => {
    const submission = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      content_id: '550e8400-e29b-41d4-a716-446655440001',
      status: 'draft_review',
      isLatest: true,
    };

    const findById = vi.fn().mockResolvedValue(submission);

    const saveRevision = vi.fn().mockResolvedValue({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    const result = await service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    expect(findById).toHaveBeenCalledExactlyOnceWith(submission.id);

    expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
      submission.id,
      submission.content_id,
      'Mohon perbaiki bagian pembuka.',
    );

    expect(result).toEqual({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });
  });

  describe('an unknown submission', () => {
    const UNKNOWN_ID = '550e8400-e29b-41d4-a716-446655440000';

    async function reviseUnknown() {
      const saveRevision = vi.fn();
      const service = new SubmissionRevisionService({
        findById: vi.fn().mockResolvedValue(null),
        saveRevision,
      });

      const error: unknown = await service
        .revise(UNKNOWN_ID, { revisionNotes: 'Mohon perbaiki bagian pembuka.' })
        .catch((caught: unknown) => caught);

      return { error, saveRevision };
    }

    it('answers 404', async () => {
      const { error } = await reviseUnknown();

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
    });

    it('carries the SUBMISSION_NOT_FOUND code, as approve does', async () => {
      const { error } = await reviseUnknown();

      expect((error as NotFoundException).getResponse()).toHaveProperty(
        'code',
        'SUBMISSION_NOT_FOUND',
      );
    });

    it('uses the same wording as approve', async () => {
      const { error } = await reviseUnknown();

      expect((error as NotFoundException).getResponse()).toEqual({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'Draft tidak ditemukan',
      });
    });

    it('saves nothing', async () => {
      const { saveRevision } = await reviseUnknown();

      expect(saveRevision).not.toHaveBeenCalled();
    });
  });

  it('answers with the content id, as approve does', async () => {
    const saved = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      contentId: '550e8400-e29b-41d4-a716-446655440001',
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    };

    const service = new SubmissionRevisionService({
      findById: vi.fn().mockResolvedValue({
        id: saved.id,
        content_id: saved.contentId,
        status: 'draft_review',
        isLatest: true,
      }),
      saveRevision: vi.fn().mockResolvedValue(saved),
    });

    await expect(
      service.revise(saved.id, { revisionNotes: saved.revisionNotes }),
    ).resolves.toEqual(saved);
  });

  describe('a status that does not allow a revision request', () => {
    const SUBMISSION_ID = '550e8400-e29b-41d4-a716-446655440000';
    // Every status but the one a draft is reviewed in. 'pending' arrives with the six-status
    // lifecycle (SCRUM-146); a proposal nobody accepted must never be open to a decision.
    const REFUSED_STATUSES = [
      'pending',
      'scheduled',
      'draft_revision',
      'draft_approved',
      'link_submitted',
    ];

    async function reviseIn(status: string, isLatest = true) {
      const saveRevision = vi.fn();
      const service = new SubmissionRevisionService({
        findById: vi.fn().mockResolvedValue({
          id: SUBMISSION_ID,
          content_id: '550e8400-e29b-41d4-a716-446655440001',
          status,
          isLatest,
        }),
        saveRevision,
      });

      const error: unknown = await service
        .revise(SUBMISSION_ID, { revisionNotes: 'Mohon perbaiki draft ini.' })
        .catch((caught: unknown) => caught);

      return { error, saveRevision };
    }

    it.each(REFUSED_STATUSES)(
      'answers 409 DRAFT_NOT_REVIEWABLE for a draft in %s',
      async (status) => {
        const { error } = await reviseIn(status);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: 'DRAFT_NOT_REVIEWABLE',
          message: 'Draft ini sudah tidak menunggu keputusan',
        });
      },
    );

    it.each(REFUSED_STATUSES)(
      'saves nothing for a draft in %s',
      async (status) => {
        const { saveRevision } = await reviseIn(status);

        expect(saveRevision).not.toHaveBeenCalled();
      },
    );

    it('refuses a status the lifecycle does not know', async () => {
      const { error, saveRevision } = await reviseIn('not_a_status');

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        code: 'DRAFT_NOT_REVIEWABLE',
        message: 'Draft ini sudah tidak menunggu keputusan',
      });
      expect(saveRevision).not.toHaveBeenCalled();
    });

    it('reports the status before staleness for an older draft that is already decided', async () => {
      const { error } = await reviseIn('draft_approved', false);

      expect((error as ConflictException).getResponse()).toHaveProperty(
        'code',
        'DRAFT_NOT_REVIEWABLE',
      );
    });
  });

  it('passes the related content ID when saving the revision', async () => {
    const submission = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      content_id: '550e8400-e29b-41d4-a716-446655440001',
      status: 'draft_review',
      isLatest: true,
    };

    const findById = vi.fn().mockResolvedValue(submission);

    const saveRevision = vi.fn().mockResolvedValue({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    await service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
    });

    expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
      submission.id,
      submission.content_id,
      'Mohon perbaiki bagian pembuka.',
    );
  });
  it('allows revision for a resubmitted draft', async () => {
  const submission = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    content_id: '550e8400-e29b-41d4-a716-446655440001',
    status: 'draft_revised',
    isLatest: true,
  };

  const findById = vi.fn().mockResolvedValue(submission);

  const saveRevision = vi.fn().mockResolvedValue({
    id: submission.id,
    status: 'draft_revision',
    revisionNotes: 'Mohon perbaiki bagian akhir.',
  });

  const service = new SubmissionRevisionService({
    findById,
    saveRevision,
  });

  await service.revise(submission.id, {
    revisionNotes: 'Mohon perbaiki bagian akhir.',
  });

  expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
    submission.id,
    submission.content_id,
    'Mohon perbaiki bagian akhir.',
  );
});
it('rejects a submission that has been superseded by a newer submission', async () => {
  const submission = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    content_id: '550e8400-e29b-41d4-a716-446655440001',
    status: 'draft_review',
    isLatest: false,
  };

  const findById = vi.fn().mockResolvedValue(submission);
  const saveRevision = vi.fn();

  const service = new SubmissionRevisionService({
    findById,
    saveRevision,
  });

  await expect(
    service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki draft ini.',
    }),
  ).rejects.toMatchObject({
    status: 409,
    response: {
      code: 'SUBMISSION_SUPERSEDED',
      message: 'Creator sudah mengirim draft yang lebih baru',
    },
  });

  expect(saveRevision).not.toHaveBeenCalled();
});
it('rejects when the submission becomes non-reviewable during revision', async () => {
  const submission = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    content_id: '550e8400-e29b-41d4-a716-446655440001',
    status: 'draft_review',
    isLatest: true,
  };

  const findById = vi.fn().mockResolvedValue(submission);

  // Simulates another request approving/revising the draft first
  const saveRevision = vi.fn().mockResolvedValue(null);

  const service = new SubmissionRevisionService({
    findById,
    saveRevision,
  });

  await expect(
    service.revise(submission.id, {
      revisionNotes: 'Mohon perbaiki draft ini.',
    }),
  ).rejects.toMatchObject({
    status: 409,
    response: {
      code: 'DRAFT_NOT_REVIEWABLE',
      message: 'Draft ini sudah tidak menunggu keputusan',
    },
  });

  expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
    submission.id,
    submission.content_id,
    'Mohon perbaiki draft ini.',
  );
});
});