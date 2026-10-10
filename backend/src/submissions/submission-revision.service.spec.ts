import { ConflictException, NotFoundException } from '@nestjs/common';
import { SubmissionRevisionService } from './submission-revision.service.js';

const SUBMISSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const CONTENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const REVISION_NOTES = 'Mohon perbaiki bagian pembuka.';
const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';

describe('SubmissionRevisionService', () => {
  it('stores the revision note and changes a review submission to draft_revision', async () => {
    const submission = {
      id: SUBMISSION_ID,
      content_id: CONTENT_ID,
      status: 'draft_review',
      isLatest: true,
    };

    const findById = vi.fn().mockResolvedValue(submission);
    const saveRevision = vi.fn().mockResolvedValue({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: REVISION_NOTES,
    });

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    const result = await service.revise(submission.id, {
      revisionNotes: REVISION_NOTES,
    });

    expect(findById).toHaveBeenCalledExactlyOnceWith(submission.id);
    expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
      submission.id,
      submission.content_id,
      REVISION_NOTES,
    );
    expect(result).toEqual({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: REVISION_NOTES,
    });
  });

  describe('an unknown submission', () => {
    async function reviseUnknown() {
      const saveRevision = vi.fn();
      const service = new SubmissionRevisionService({
        findById: vi.fn().mockResolvedValue(null),
        saveRevision,
      });

      const error: unknown = await service
        .revise(SUBMISSION_ID, { revisionNotes: REVISION_NOTES })
        .catch((caught: unknown) => caught);

      return { error, saveRevision };
    }

    it('answers 404', async () => {
      const { error } = await reviseUnknown();

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
    });

    it('carries the SUBMISSION_NOT_FOUND code', async () => {
      const { error } = await reviseUnknown();

      expect((error as NotFoundException).getResponse()).toHaveProperty(
        'code',
        'SUBMISSION_NOT_FOUND',
      );
    });

    it('uses the expected wording', async () => {
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

  it('answers with the content id', async () => {
    const saved = {
      id: SUBMISSION_ID,
      contentId: CONTENT_ID,
      status: 'draft_revision',
      revisionNotes: REVISION_NOTES,
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
          content_id: CONTENT_ID,
          status,
          isLatest,
        }),
        saveRevision,
      });

      const error: unknown = await service
        .revise(SUBMISSION_ID, {
          revisionNotes: 'Mohon perbaiki draft ini.',
        })
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

    it('checks the status before staleness for an older decided draft', async () => {
      const { error } = await reviseIn('draft_approved', false);

      expect((error as ConflictException).getResponse()).toHaveProperty(
        'code',
        'DRAFT_NOT_REVIEWABLE',
      );
    });
  });

  it('passes the related content ID when saving the revision', async () => {
    const submission = {
      id: SUBMISSION_ID,
      content_id: CONTENT_ID,
      status: 'draft_review',
      isLatest: true,
    };

    const findById = vi.fn().mockResolvedValue(submission);
    const saveRevision = vi.fn().mockResolvedValue({
      id: submission.id,
      status: 'draft_revision',
      revisionNotes: REVISION_NOTES,
    });

    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    await service.revise(submission.id, {
      revisionNotes: REVISION_NOTES,
    });

    expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
      submission.id,
      submission.content_id,
      REVISION_NOTES,
    );
  });

  it('allows revision for a resubmitted draft', async () => {
    const submission = {
      id: SUBMISSION_ID,
      content_id: CONTENT_ID,
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

  it('rejects a submission superseded by a newer submission', async () => {
    const submission = {
      id: SUBMISSION_ID,
      content_id: CONTENT_ID,
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
      id: SUBMISSION_ID,
      content_id: CONTENT_ID,
      status: 'draft_review',
      isLatest: true,
    };

    const findById = vi.fn().mockResolvedValue(submission);
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

  it('forwards the Admin ID when saving a revision', async () => {
    const submission = {
      id: SUBMISSION_ID,
      content_id: CONTENT_ID,
      status: 'draft_review',
      isLatest: true,
    };

    const saved = {
      id: submission.id,
      contentId: submission.content_id,
      status: 'draft_revision' as const,
      revisionNotes: REVISION_NOTES,
    };

    const findById = vi.fn().mockResolvedValue(submission);
    const saveRevision = vi.fn().mockResolvedValue(saved);
    const service = new SubmissionRevisionService({
      findById,
      saveRevision,
    });

    await expect(
      service.revise(
        submission.id,
        { revisionNotes: REVISION_NOTES },
        ADMIN_USER_ID,
      ),
    ).resolves.toEqual(saved);

    expect(saveRevision).toHaveBeenCalledExactlyOnceWith(
      submission.id,
      submission.content_id,
      REVISION_NOTES,
      ADMIN_USER_ID,
    );
  });
});