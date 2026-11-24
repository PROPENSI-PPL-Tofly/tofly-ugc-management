import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  DraftSubmissionService,
  type DraftSubmissionClient,
} from './draft-submission.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const SUBMISSION_ID = '3f8a1c2d-4b5e-4f6a-9b7c-1d2e3f4a5b6c';
const SUBMITTED_AT = new Date('2026-10-02T03:04:05.000Z');
const INPUT = {
  link: 'https://drive.google.com/d/1',
  notes: 'Cek menit 0:10',
};
/** A period that began long ago, so a test about anything else never meets the start-date rule. */
const LONG_STARTED = new Date('2000-01-01T00:00:00Z');
/** PBI-30.2: a period starting 2 December 2026, which Jakarta reaches at 17:00 UTC on the 1st. */
const STARTS_2_DEC = new Date('2026-12-02T00:00:00Z');

// Explicitly lists committed statuses as defined by PBI-6.
const COMMITTED = [
  'scheduled',
  'draft_review',
  'draft_revision',
  'draft_approved',
  'link_submitted',
];

function stub(
  options: {
    content?: { id: string; status: string } | null;
    /** The start day of the content's contract period. */
    periodStart?: Date;
    /** PBI-37: when an early end closed the content. */
    closedAt?: Date;
    updated?: number;
    creator?: {
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    } | null;
  } = {},
) {
  const transaction = {
    contents: {
      findFirst: vi.fn().mockResolvedValue(
        options.content === null
          ? null
          : {
              ...(options.content ?? { id: CONTENT_ID, status: 'scheduled' }),
              closed_at: options.closedAt ?? null,
              contracts: { start_date: options.periodStart ?? LONG_STARTED },
            },
      ),
      updateMany: vi.fn().mockResolvedValue({ count: options.updated ?? 1 }),
    },
    submissions: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'prior-submission-1' },
          { id: 'prior-submission-2' },
        ]),
      create: vi
        .fn()
        .mockResolvedValue({ id: SUBMISSION_ID, created_at: SUBMITTED_AT }),
    },
    creators: {
      findUnique: vi.fn().mockResolvedValue(
        options.creator === undefined
          ? {
            first_name: 'Dina',
            middle_name: 'Ayu',
            last_name: 'Putri',
          }
          : options.creator,
      ),
    },
    content_events: {
      create: vi.fn().mockResolvedValue({ id: 'event-id' }),
    },
  };

  const client = {
    $transaction: vi.fn(async (work) => work(transaction)),
  } satisfies DraftSubmissionClient;

  return {
    client,
    transaction,
    service: new DraftSubmissionService(client),
  };
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
  it('looks up only the calling creator’s committed content (OWASP A01)', async () => {
    const { transaction, service } = stub({});

    await service.submit(CONTENT_ID, CREATOR_ID, INPUT);

    expect(transaction.contents.findFirst).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        status: { in: COMMITTED },
        contracts: { creator_id: CREATOR_ID },
      },
      // Also the period's start day, to refuse a draft before the period starts (PBI-30.2), and
      // when an early end closed it (PBI-37).
      select: {
        id: true,
        status: true,
        closed_at: true,
        contracts: { select: { start_date: true } },
      },
    });
  });

  it('returns 409 PERIOD_NOT_STARTED before Jakarta reaches the start date and saves nothing (AC 8.2.2)', async () => {
    const { transaction, service } = stub({ periodStart: STARTS_2_DEC });

    // 23:59:59.999 WIB on 1 December.
    const error = await failure(
      service.submit(
        CONTENT_ID,
        CREATOR_ID,
        INPUT,
        new Date('2026-12-01T16:59:59.999Z'),
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'PERIOD_NOT_STARTED',
      message: 'Periode kontrak konten ini belum dimulai',
    });
    expect(transaction.contents.updateMany).not.toHaveBeenCalled();
    expect(transaction.submissions.create).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });

  // PBI-37: content due after the last day of a contract ended early is closed.
  it('returns 409 CONTENT_CLOSED for content an early end closed and saves nothing', async () => {
    const { transaction, service } = stub({ closedAt: new Date('2026-11-24T03:00:00Z') });

    const error = await failure(service.submit(CONTENT_ID, CREATOR_ID, INPUT));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'CONTENT_CLOSED',
      message: 'Konten ini ditutup karena kontrak diakhiri lebih awal',
    });
    expect(transaction.contents.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ closed_at: true }),
      }),
    );
    expect(transaction.contents.updateMany).not.toHaveBeenCalled();
    expect(transaction.submissions.create).not.toHaveBeenCalled();
  });

  it('accepts the draft from Jakarta midnight on the start date', async () => {
    const { transaction, service } = stub({ periodStart: STARTS_2_DEC });

    // 00:00 WIB on 2 December, still 1 December in UTC.
    const result = await service.submit(
      CONTENT_ID,
      CREATOR_ID,
      INPUT,
      new Date('2026-12-01T17:00:00Z'),
    );

    expect(result.status).toBe('draft_review');
    expect(transaction.submissions.create).toHaveBeenCalledTimes(1);
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

  it('records a Draft Submitted event with the creator identity and next submission version', async () => {
    const { transaction, service } = stub({});

    await service.submit(CONTENT_ID, CREATOR_ID, INPUT);

    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Draft Submitted',
        actor_name: 'Dina Ayu Putri',
        actor_role: 'creator',
        occurred_at: SUBMITTED_AT,
        event_data: { version: 3, link: INPUT.link, note: INPUT.notes },
      },
    });

    expect(
      transaction.contents.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.content_events.create.mock.invocationCallOrder[0],
    );

    expect(
      transaction.submissions.create.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transaction.content_events.create.mock.invocationCallOrder[0],
    );
  });

  it('uses available creator name parts when optional names are absent', async () => {
    const { transaction, service } = stub({
      creator: {
        first_name: 'Dina',
        middle_name: null,
        last_name: null,
      },
    });

    await service.submit(CONTENT_ID, CREATOR_ID, INPUT);

    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Draft Submitted',
        actor_name: 'Dina',
        actor_role: 'creator',
        occurred_at: SUBMITTED_AT,
        event_data: { version: 3, link: INPUT.link, note: INPUT.notes },
      },
    });
  });

  it('resubmits a draft under revision and returns it to draft_review', async () => {
    const { transaction, service } = stub({
      content: { id: CONTENT_ID, status: 'draft_revision' },
    });

    const result = await service.submit(CONTENT_ID, CREATOR_ID, {
      link: INPUT.link,
      notes: null,
    });

    expect(transaction.contents.updateMany).toHaveBeenCalledWith({
      where: { id: CONTENT_ID, status: 'draft_revision' },
      data: { status: 'draft_review' },
    });

    expect(transaction.submissions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creator_notes: null,
        }),
      }),
    );

    expect(result).toMatchObject({
      status: 'draft_review',
      notes: null,
    });

    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Draft Submitted',
        actor_name: 'Dina Ayu Putri',
        actor_role: 'creator',
        occurred_at: SUBMITTED_AT,
        event_data: { version: 3, link: INPUT.link },
      },
    });
  });

  it('returns the same 404 for missing content, another creator’s content, or a proposal', async () => {
    const { transaction, service } = stub({ content: null });

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, INPUT),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'CONTENT_NOT_FOUND',
      message: 'Konten tidak ditemukan',
    });

    expect(transaction.contents.updateMany).not.toHaveBeenCalled();
    expect(transaction.submissions.create).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the creator profile is missing and saves no submission or event', async () => {
    const { transaction, service } = stub({ creator: null });

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, INPUT),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'CREATOR_NOT_FOUND',
      message: 'Kreator tidak ditemukan',
    });

    expect(transaction.contents.updateMany).toHaveBeenCalled();
    expect(transaction.submissions.findMany).toHaveBeenCalled();
    expect(transaction.creators.findUnique).toHaveBeenCalledWith({
      where: { id: CREATOR_ID },
      select: {
        first_name: true,
        middle_name: true,
        last_name: true,
      },
    });
    expect(transaction.submissions.create).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });

  it.each([
    'draft_review',
    'draft_approved',
    'link_submitted',
  ])(
    'returns 409 while the content is %s and saves nothing',
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
      expect(transaction.content_events.create).not.toHaveBeenCalled();
    },
  );

  it('returns 409 and saves no submission when another hand-in changes the status first', async () => {
    const { transaction, service } = stub({ updated: 0 });

    const error = await failure(
      service.submit(CONTENT_ID, CREATOR_ID, INPUT),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'DRAFT_NOT_ELIGIBLE',
    });

    expect(transaction.submissions.create).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });
});