import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  DraftSubmissionService,
  type DraftSubmissionClient,
} from './draft-submission.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const SUBMISSION_ID = '3f8a1c2d-4b5e-4f6a-9b7c-1d2e3f4a5b6c';
const SUBMITTED_AT = new Date('2026-10-02T03:04:05.000Z');
const INPUT = { link: 'https://drive.google.com/d/1', notes: 'Cek menit 0:10' };

function stub(options: {
  content?: { id: string; status: string } | null;
  updated?: number;
}) {
  const transaction = {
    contents: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options.content === undefined
            ? { id: CONTENT_ID, status: 'scheduled' }
            : options.content,
        ),
      updateMany: vi.fn().mockResolvedValue({ count: options.updated ?? 1 }),
    },
    submissions: {
      create: vi
        .fn()
        .mockResolvedValue({ id: SUBMISSION_ID, created_at: SUBMITTED_AT }),
    },
  };
  const client = {
    $transaction: vi.fn(async (work) => work(transaction)),
  } satisfies DraftSubmissionClient;
  return { client, transaction, service: new DraftSubmissionService(client) };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the hand-in to be refused');
}

describe('DraftSubmissionService.submit', () => {
  it('looks the content up only among the calling creator’s committed contents (OWASP A01)', async () => {
    const { transaction, service } = stub({});

    await service.submit(CONTENT_ID, CREATOR_ID, INPUT);

    expect(transaction.contents.findFirst).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        is_proposal: false,
        contracts: { creator_id: CREATOR_ID },
      },
      select: { id: true, status: true },
    });
  });

  it('hands in a first draft: the content goes to review and the link is saved with the note', async () => {
    const { transaction, service } = stub({});

    const result = await service.submit(CONTENT_ID, CREATOR_ID, INPUT);

    expect(transaction.contents.updateMany).toHaveBeenCalledWith({
      where: { id: CONTENT_ID, status: 'scheduled' },
      data: { status: 'draft_review' },
    });
    expect(transaction.submissions.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        creator_id: CREATOR_ID,
        link: INPUT.link,
        creator_notes: INPUT.notes,
      },
      select: { id: true, created_at: true },
    });
    expect(result).toEqual({
      contentId: CONTENT_ID,
      submissionId: SUBMISSION_ID,
      status: 'draft_review',
      link: INPUT.link,
      notes: INPUT.notes,
      submittedAt: '2026-10-02T03:04:05.000Z',
    });
  });

  it('hands in a resubmit: a content under revision becomes draft_revised', async () => {
    const { transaction, service } = stub({
      content: { id: CONTENT_ID, status: 'draft_revision' },
    });

    const result = await service.submit(CONTENT_ID, CREATOR_ID, {
      link: INPUT.link,
      notes: null,
    });

    expect(transaction.contents.updateMany).toHaveBeenCalledWith({
      where: { id: CONTENT_ID, status: 'draft_revision' },
      data: { status: 'draft_revised' },
    });
    expect(transaction.submissions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creator_notes: null }),
      }),
    );
    expect(result).toMatchObject({ status: 'draft_revised', notes: null });
  });

  it('answers 404 alike for a missing content, another creator’s content and a proposal, so none of them leak', async () => {
    const { transaction, service } = stub({ content: null });

    const error = await failure(service.submit(CONTENT_ID, CREATOR_ID, INPUT));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'CONTENT_NOT_FOUND',
      message: 'Konten tidak ditemukan',
    });
    expect(transaction.contents.updateMany).not.toHaveBeenCalled();
    expect(transaction.submissions.create).not.toHaveBeenCalled();
  });

  it.each([
    'draft_review',
    'draft_revised',
    'draft_approved',
    'link_submitted',
  ])(
    'answers 409 while the content is %s, and saves nothing',
    async (status) => {
      const { transaction, service } = stub({
        content: { id: CONTENT_ID, status },
      });

      const error = await failure(
        service.submit(CONTENT_ID, CREATOR_ID, INPUT),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        code: 'DRAFT_NOT_ELIGIBLE',
        message: 'Konten ini sedang tidak menerima draft',
      });
      expect(transaction.contents.updateMany).not.toHaveBeenCalled();
      expect(transaction.submissions.create).not.toHaveBeenCalled();
    },
  );

  it('answers 409 and saves no link when another hand-in moved the status first', async () => {
    const { transaction, service } = stub({ updated: 0 });

    const error = await failure(service.submit(CONTENT_ID, CREATOR_ID, INPUT));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'DRAFT_NOT_ELIGIBLE',
    });
    expect(transaction.submissions.create).not.toHaveBeenCalled();
  });
});
