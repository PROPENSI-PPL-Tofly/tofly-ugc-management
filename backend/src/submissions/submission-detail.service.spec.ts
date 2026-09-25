import { NotFoundException } from '@nestjs/common';
import {
  SubmissionDetailService,
  type SubmissionDetailClient,
} from './submission-detail.service.js';

const SUBMISSION_ID = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';

function stubClient(
  found: {
    brief: string;
    status: string;
    link: string;
    revisions: {
      revision_notes: string | null;
      created_at: Date;
      updated_at: Date;
    }[];
  } | null,
) {
  return {
    submissions: {
      findUnique: vi.fn().mockResolvedValue(
        found && {
          id: SUBMISSION_ID,
          content_id: CONTENT_ID,
          link: found.link,
          contents: {
            brief: found.brief,
            status: found.status,
            submissions: found.revisions.filter(
              (revision) => revision.revision_notes !== null,
            ),
          },
        },
      ),
    },
  } satisfies SubmissionDetailClient;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('SubmissionDetailService.getDetail', () => {
  it('returns brief, draft link, current status, and revision history with notes only', async () => {
    const client = stubClient({
      brief: 'Create a short product review',
      status: 'draft_revised',
      link: 'https://drive.example.com/draft-2',
      revisions: [
        {
          revision_notes: null,
          created_at: new Date('2026-09-01T00:00:00.000Z'),
          updated_at: new Date('2026-09-20T00:00:00.000Z'),
        },
        {
          revision_notes: 'Tolong ubah opening',
          created_at: new Date('2026-09-05T00:00:00.000Z'),
          updated_at: new Date('2026-09-21T00:00:00.000Z'),
        },
      ],
    });

    await expect(
      new SubmissionDetailService(client).getDetail(SUBMISSION_ID),
    ).resolves.toEqual({
      brief: 'Create a short product review',
      link: 'https://drive.example.com/draft-2',
      status: 'draft_revised',
      revisionHistory: [
        {
          note: 'Tolong ubah opening',
          date: '2026-09-21T00:00:00.000Z',
        },
      ],
    });
  });

  it('reads only revision notes with the note update timestamp', async () => {
    const client = stubClient({
      brief: 'Create a short product review',
      status: 'draft_revised',
      link: 'https://drive.example.com/draft-2',
      revisions: [
        {
          revision_notes: null,
          created_at: new Date('2026-09-01T00:00:00.000Z'),
          updated_at: new Date('2026-09-20T00:00:00.000Z'),
        },
        {
          revision_notes: 'Tolong ubah opening',
          created_at: new Date('2026-09-05T00:00:00.000Z'),
          updated_at: new Date('2026-09-21T00:00:00.000Z'),
        },
      ],
    });

    await new SubmissionDetailService(client).getDetail(SUBMISSION_ID);

    expect(client.submissions.findUnique).toHaveBeenCalledWith({
      where: { id: SUBMISSION_ID },
      select: {
        id: true,
        content_id: true,
        link: true,
        contents: {
          select: {
            brief: true,
            status: true,
            submissions: {
              where: {
                revision_notes: {
                  not: null,
                },
              },
              orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
              select: {
                revision_notes: true,
                updated_at: true,
              },
            },
          },
        },
      },
    });
  });

  it('answers 404 for an unknown submission', async () => {
    const client = stubClient(null);

    const error = await rejection(
      new SubmissionDetailService(client).getDetail(SUBMISSION_ID),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'SUBMISSION_NOT_FOUND',
      message: 'Draft tidak ditemukan',
    });
  });
});
