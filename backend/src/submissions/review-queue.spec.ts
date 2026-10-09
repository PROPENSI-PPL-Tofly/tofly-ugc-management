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
    revisionCount: 0,
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

  // Every queued draft is Draft Waiting for Review, so the old status dropdown became one
  // question: is this a resubmit or a first hand-in?
  describe('resubmitted', () => {
    it('turns "true" into resubmits only', () => {
      expect(
        checkQueueQuery({ status: 'review', resubmitted: 'true' }),
      ).toEqual({ resubmitted: true });
    });

    it('turns "false" into first hand-ins only', () => {
      expect(
        checkQueueQuery({ status: 'review', resubmitted: 'false' }),
      ).toEqual({ resubmitted: false });
    });

    it.each([
      ['a word', 'yes'],
      ['a number', '1'],
      ['another case', 'TRUE'],
      ['an empty value', ''],
      ['the removed status name', 'draft_revised'],
      ['a repeated parameter', ['true', 'false']],
    ])('answers 400 for %s', (_, resubmitted) => {
      expect(() =>
        checkQueueQuery({ status: 'review', resubmitted }),
      ).toThrow(BadRequestException);
    });
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
        resubmitted: 'true',
        overdue: 'true',
      }),
    ).toEqual({
      q: 'dina',
      type: 'specific',
      resubmitted: true,
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
      revisionCount: 0,
      deadline: new Date('2026-10-01T00:00:00.000Z'),
    });
    const resubmit = entry({
      submissionId: 'resubmit',
      revisionCount: 1,
      deadline: new Date('2026-12-01T00:00:00.000Z'),
    });

    expect(sorted([firstHandIn, resubmit])).toEqual(['resubmit', 'first']);
    expect(sorted([resubmit, firstHandIn])).toEqual(['resubmit', 'first']);
  });

  // Resubmitted is yes or no: a third hand-in is not more urgent than a second.
  it('orders two resubmits by deadline, whatever their revision counts', () => {
    const manyRevisions = entry({
      submissionId: 'many',
      revisionCount: 4,
      deadline: new Date('2026-10-20T00:00:00.000Z'),
    });
    const oneRevision = entry({
      submissionId: 'one',
      revisionCount: 1,
      deadline: new Date('2026-10-05T00:00:00.000Z'),
    });

    expect(sorted([manyRevisions, oneRevision])).toEqual(['one', 'many']);
  });

  it('orders drafts on the same hand-in by nearest deadline', () => {
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
