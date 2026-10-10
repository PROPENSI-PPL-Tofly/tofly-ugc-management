import { BadRequestException } from '@nestjs/common';
import {
  checkContentListQuery,
  MAX_FILTER_VALUES,
  MAX_SEARCH_LENGTH,
  TAB_STATUSES,
} from './content-list.js';
import { CONTENT_STATUSES } from './content-lifecycle.js';

const CREATOR_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const CREATOR_B = '11111111-1111-4111-8111-111111111111';

function message(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof BadRequestException) {
      return error.message;
    }
    throw error;
  }
  throw new Error('expected a 400');
}

describe('TAB_STATUSES', () => {
  it('puts what waits for an admin under Perlu Approval', () => {
    expect(TAB_STATUSES.needs_approval).toEqual(['pending', 'draft_review']);
  });

  it('puts what waits for the creator under Menunggu Kreator', () => {
    expect(TAB_STATUSES.waiting_creator).toEqual([
      'scheduled',
      'draft_revision',
      'draft_approved',
    ]);
  });

  it('puts a submitted link under Selesai', () => {
    expect(TAB_STATUSES.done).toEqual(['link_submitted']);
  });

  it('lists every status under Semua', () => {
    expect(TAB_STATUSES.all).toEqual([...CONTENT_STATUSES]);
  });

  it('gives every status exactly one tab besides Semua', () => {
    const placed = [
      ...TAB_STATUSES.needs_approval,
      ...TAB_STATUSES.waiting_creator,
      ...TAB_STATUSES.done,
    ];

    expect([...placed].sort()).toEqual([...CONTENT_STATUSES].sort());
  });
});

describe('checkContentListQuery', () => {
  it('lists every content by nearest deadline when nothing is asked', () => {
    expect(checkContentListQuery({})).toEqual({
      tab: 'all',
      sort: 'deadline_asc',
    });
  });

  describe('tab', () => {
    it.each(['all', 'needs_approval', 'waiting_creator', 'done'])(
      'accepts %s',
      (tab) => {
        expect(checkContentListQuery({ tab }).tab).toBe(tab);
      },
    );

    it.each([
      ['an unknown tab', 'archived'],
      ['a different case', 'Done'],
      ['empty', ''],
      ['a list', ['all', 'done']],
    ])('answers 400 for %s', (_, tab) => {
      expect(message(() => checkContentListQuery({ tab }))).toBe(
        'tab must be one of all, needs_approval, waiting_creator, done',
      );
    });
  });

  describe('q', () => {
    it('trims the search text', () => {
      expect(checkContentListQuery({ q: '  dina  ' }).q).toBe('dina');
    });

    it.each([
      ['empty', ''],
      ['only spaces', '   '],
    ])('leaves the search out when it is %s', (_, q) => {
      expect(checkContentListQuery({ q })).not.toHaveProperty('q');
    });

    it('accepts a search at the length cap', () => {
      const q = 'a'.repeat(MAX_SEARCH_LENGTH);

      expect(checkContentListQuery({ q }).q).toBe(q);
    });

    it('answers 400 for a search over the length cap', () => {
      const q = 'a'.repeat(MAX_SEARCH_LENGTH + 1);

      expect(message(() => checkContentListQuery({ q }))).toBe(
        `q must be ${MAX_SEARCH_LENGTH} characters or fewer`,
      );
    });

    it('answers 400 when the search is sent more than once', () => {
      expect(message(() => checkContentListQuery({ q: ['a', 'b'] }))).toBe(
        'q must be a single text value',
      );
    });
  });

  describe('creator', () => {
    it('reads one creator as a list of one', () => {
      expect(checkContentListQuery({ creator: CREATOR_A }).creators).toEqual([
        CREATOR_A,
      ]);
    });

    it('reads repeated creators as a list', () => {
      expect(
        checkContentListQuery({ creator: [CREATOR_A, CREATOR_B] }).creators,
      ).toEqual([CREATOR_A, CREATOR_B]);
    });

    it('keeps a creator named twice once', () => {
      expect(
        checkContentListQuery({ creator: [CREATOR_A, CREATOR_A] }).creators,
      ).toEqual([CREATOR_A]);
    });

    it('leaves creators out when none is named', () => {
      expect(checkContentListQuery({})).not.toHaveProperty('creators');
    });

    it.each([
      ['not an id', 'dina'],
      ['empty', ''],
      ['an id with something after it', `${CREATOR_A}' or 1=1`],
      ['an id with something before it', `x${CREATOR_A}`],
      ['a list holding one bad id', [CREATOR_A, 'dina']],
      ['an object', { id: CREATOR_A }],
      ['a list inside a list', [[CREATOR_A]]],
    ])('answers 400 when creator is %s', (_, creator) => {
      expect(message(() => checkContentListQuery({ creator }))).toBe(
        'creator must be a creator id',
      );
    });

    it('accepts creators up to the cap', () => {
      const creator = Array.from(
        { length: MAX_FILTER_VALUES },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      );

      expect(checkContentListQuery({ creator }).creators).toHaveLength(
        MAX_FILTER_VALUES,
      );
    });

    it('answers 400 for more creators than the cap', () => {
      const creator = Array.from(
        { length: MAX_FILTER_VALUES + 1 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      );

      expect(message(() => checkContentListQuery({ creator }))).toBe(
        `creator takes at most ${MAX_FILTER_VALUES} values`,
      );
    });
  });

  describe('type', () => {
    it('reads one type as a list of one', () => {
      expect(checkContentListQuery({ type: 'evergreen' }).types).toEqual([
        'evergreen',
      ]);
    });

    it('reads repeated types as a list, each once', () => {
      expect(
        checkContentListQuery({ type: ['specific', 'evergreen', 'specific'] })
          .types,
      ).toEqual(['specific', 'evergreen']);
    });

    it.each([
      ['an unknown type', 'sponsored'],
      ['a different case', 'Evergreen'],
      ['a list holding an unknown type', ['evergreen', 'sponsored']],
      ['an object', { is: 'evergreen' }],
    ])('answers 400 when type is %s', (_, type) => {
      expect(message(() => checkContentListQuery({ type }))).toBe(
        'type must be one of evergreen, specific',
      );
    });
  });

  describe('status', () => {
    it.each([...CONTENT_STATUSES])('accepts %s', (status) => {
      expect(checkContentListQuery({ status }).statuses).toEqual([status]);
    });

    it('reads repeated statuses as a list, each once', () => {
      expect(
        checkContentListQuery({
          status: ['pending', 'draft_review', 'pending'],
        }).statuses,
      ).toEqual(['pending', 'draft_review']);
    });

    it.each([
      ['a status the lifecycle dropped', 'draft_revised'],
      ['the old queue name', 'review'],
      ['a list holding an unknown status', ['pending', 'approved']],
    ])('answers 400 when status is %s', (_, status) => {
      expect(message(() => checkContentListQuery({ status }))).toBe(
        `status must be one of ${CONTENT_STATUSES.join(', ')}`,
      );
    });
  });

  describe('overdue', () => {
    it('keeps only overdue content for true', () => {
      expect(checkContentListQuery({ overdue: 'true' }).overdue).toBe(true);
    });

    it('leaves the filter out for false', () => {
      expect(checkContentListQuery({ overdue: 'false' })).not.toHaveProperty(
        'overdue',
      );
    });

    it.each([
      ['another word', 'yes'],
      ['a number', '1'],
      ['a list', ['true', 'true']],
    ])('answers 400 when overdue is %s', (_, overdue) => {
      expect(message(() => checkContentListQuery({ overdue }))).toBe(
        'overdue must be true or false',
      );
    });
  });

  describe('deadline period', () => {
    it('accepts a start day alone', () => {
      expect(
        checkContentListQuery({ deadlineFrom: '2026-10-01' }).deadlineFrom,
      ).toBe('2026-10-01');
    });

    it('accepts an end day alone', () => {
      expect(
        checkContentListQuery({ deadlineTo: '2026-10-31' }).deadlineTo,
      ).toBe('2026-10-31');
    });

    it('accepts a period of one day', () => {
      expect(
        checkContentListQuery({
          deadlineFrom: '2026-10-10',
          deadlineTo: '2026-10-10',
        }),
      ).toMatchObject({ deadlineFrom: '2026-10-10', deadlineTo: '2026-10-10' });
    });

    it.each([
      ['a day that does not exist', '2026-02-30'],
      ['another format', '10/10/2026'],
      ['a timestamp', '2026-10-10T00:00:00Z'],
      ['empty', ''],
      ['a list', ['2026-10-01', '2026-10-02']],
      ['a list of one day', ['2026-10-01']],
    ])('answers 400 when the start is %s', (_, deadlineFrom) => {
      expect(message(() => checkContentListQuery({ deadlineFrom }))).toBe(
        'deadlineFrom must be a day written as YYYY-MM-DD',
      );
    });

    it('answers 400 when the end is not a day', () => {
      expect(
        message(() => checkContentListQuery({ deadlineTo: '2026-13-01' })),
      ).toBe('deadlineTo must be a day written as YYYY-MM-DD');
    });

    it('answers 400 when the period ends before it starts', () => {
      expect(
        message(() =>
          checkContentListQuery({
            deadlineFrom: '2026-10-11',
            deadlineTo: '2026-10-10',
          }),
        ),
      ).toBe('deadlineFrom must not be after deadlineTo');
    });
  });

  describe('sort', () => {
    it.each(['deadline_asc', 'deadline_desc'])('accepts %s', (sort) => {
      expect(checkContentListQuery({ sort }).sort).toBe(sort);
    });

    it.each([
      ['another column', 'name_asc'],
      ['a bare column', 'deadline'],
      ['a list', ['deadline_asc', 'deadline_desc']],
    ])('answers 400 when sort is %s', (_, sort) => {
      expect(message(() => checkContentListQuery({ sort }))).toBe(
        'sort must be one of deadline_asc, deadline_desc',
      );
    });
  });

  it.each([
    ['creator', CREATOR_A],
    ['type', 'evergreen'],
    ['status', 'pending'],
  ])('names %s when it is sent more times than the cap', (name, value) => {
    const values = Array.from({ length: MAX_FILTER_VALUES + 1 }, () => value);

    expect(message(() => checkContentListQuery({ [name]: values }))).toBe(
      `${name} takes at most ${MAX_FILTER_VALUES} values`,
    );
  });

  it('reads every filter together', () => {
    expect(
      checkContentListQuery({
        tab: 'needs_approval',
        q: 'unboxing',
        creator: CREATOR_A,
        type: 'specific',
        status: 'draft_review',
        overdue: 'true',
        deadlineFrom: '2026-10-01',
        deadlineTo: '2026-10-31',
        sort: 'deadline_desc',
      }),
    ).toEqual({
      tab: 'needs_approval',
      q: 'unboxing',
      creators: [CREATOR_A],
      types: ['specific'],
      statuses: ['draft_review'],
      overdue: true,
      deadlineFrom: '2026-10-01',
      deadlineTo: '2026-10-31',
      sort: 'deadline_desc',
    });
  });
});
