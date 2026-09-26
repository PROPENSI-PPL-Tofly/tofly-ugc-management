import { BadRequestException } from '@nestjs/common';
import {
  checkQueueQuery,
  compareQueueEntries,
  MAX_SEARCH_LENGTH,
  type QueueEntry,
} from './review-queue.js';

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    submissionId: 'sub-1',
    status: 'draft_review',
    deadline: new Date('2026-10-10T00:00:00.000Z'),
    submittedAt: new Date('2026-10-01T08:00:00.000Z'),
    ...overrides,
  };
}

describe('checkQueueQuery', () => {
  it('accepts status=review with no filters', () => {
    expect(checkQueueQuery({ status: 'review' })).toEqual({});
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['another status', 'approved'],
    ['a different case', 'Review'],
  ])('answers 400 when status is %s', (_, status) => {
    expect(() => checkQueueQuery({ status })).toThrow(BadRequestException);
  });

  describe('q', () => {
    it('trims the search text', () => {
      expect(checkQueueQuery({ status: 'review', q: '  dina  ' })).toEqual({
        q: 'dina',
      });
    });

    it.each([
      ['blank', '   '],
      ['empty', ''],
      ['repeated in the query string', ['dina', 'budi']],
    ])('ignores a %s search', (_, q) => {
      expect(checkQueueQuery({ status: 'review', q })).toEqual({});
    });

    it('accepts a search at the length cap', () => {
      const q = 'a'.repeat(MAX_SEARCH_LENGTH);
      expect(checkQueueQuery({ status: 'review', q })).toEqual({ q });
    });

    it('answers 400 for a search one character over the cap', () => {
      const q = 'a'.repeat(MAX_SEARCH_LENGTH + 1);
      expect(() => checkQueueQuery({ status: 'review', q })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('type', () => {
    it.each(['evergreen', 'specific'] as const)('accepts %s', (type) => {
      expect(checkQueueQuery({ status: 'review', type })).toEqual({ type });
    });

    it.each(['Evergreen', 'all', 'proposal', ''])(
      'answers 400 for "%s"',
      (type) => {
        expect(() => checkQueueQuery({ status: 'review', type })).toThrow(
          BadRequestException,
        );
      },
    );
  });

  describe('filterStatus', () => {
    it.each(['draft_review', 'draft_revised'] as const)(
      'accepts %s',
      (filterStatus) => {
        expect(checkQueueQuery({ status: 'review', filterStatus })).toEqual({
          status: filterStatus,
        });
      },
    );

    // draft_revision waits on the creator and draft_approved is already decided, so neither
    // can ever be in the queue; asking for them is a client bug, not an empty result.
    it.each(['draft_revision', 'draft_approved', 'scheduled', 'all'])(
      'answers 400 for %s',
      (filterStatus) => {
        expect(() =>
          checkQueueQuery({ status: 'review', filterStatus }),
        ).toThrow(BadRequestException);
      },
    );
  });

  describe('overdue', () => {
    it('turns "true" into the overdue filter', () => {
      expect(checkQueueQuery({ status: 'review', overdue: 'true' })).toEqual({
        overdue: true,
      });
    });

    it('treats "false" as no overdue filter', () => {
      expect(checkQueueQuery({ status: 'review', overdue: 'false' })).toEqual(
        {},
      );
    });

    it.each(['yes', '1', 'TRUE', ''])('answers 400 for "%s"', (overdue) => {
      expect(() => checkQueueQuery({ status: 'review', overdue })).toThrow(
        BadRequestException,
      );
    });
  });

  it('combines every filter', () => {
    expect(
      checkQueueQuery({
        status: 'review',
        q: 'dina',
        type: 'specific',
        filterStatus: 'draft_revised',
        overdue: 'true',
      }),
    ).toEqual({
      q: 'dina',
      type: 'specific',
      status: 'draft_revised',
      overdue: true,
    });
  });
});

describe('compareQueueEntries', () => {
  function sorted(entries: QueueEntry[]): string[] {
    return [...entries]
      .sort(compareQueueEntries)
      .map((item) => item.submissionId);
  }

  it('puts a resubmitted draft above a first hand-in even when its deadline is later', () => {
    const firstHandIn = entry({
      submissionId: 'first',
      status: 'draft_review',
      deadline: new Date('2026-10-01T00:00:00.000Z'),
    });
    const resubmit = entry({
      submissionId: 'resubmit',
      status: 'draft_revised',
      deadline: new Date('2026-12-01T00:00:00.000Z'),
    });

    expect(sorted([firstHandIn, resubmit])).toEqual(['resubmit', 'first']);
    expect(sorted([resubmit, firstHandIn])).toEqual(['resubmit', 'first']);
  });

  it('orders drafts with the same status by nearest deadline', () => {
    const later = entry({
      submissionId: 'later',
      deadline: new Date('2026-10-20T00:00:00.000Z'),
    });
    const sooner = entry({
      submissionId: 'sooner',
      deadline: new Date('2026-10-05T00:00:00.000Z'),
    });

    expect(sorted([later, sooner])).toEqual(['sooner', 'later']);
  });

  it('breaks a deadline tie by the draft that has waited longest', () => {
    const newer = entry({
      submissionId: 'newer',
      submittedAt: new Date('2026-10-03T08:00:00.000Z'),
    });
    const older = entry({
      submissionId: 'older',
      submittedAt: new Date('2026-10-02T08:00:00.000Z'),
    });

    expect(sorted([newer, older])).toEqual(['older', 'newer']);
  });

  it('falls back to the submission id so equal entries keep a stable page order', () => {
    const b = entry({ submissionId: 'b' });
    const a = entry({ submissionId: 'a' });

    expect(sorted([b, a])).toEqual(['a', 'b']);
    expect(compareQueueEntries(a, a)).toBe(0);
  });
});
