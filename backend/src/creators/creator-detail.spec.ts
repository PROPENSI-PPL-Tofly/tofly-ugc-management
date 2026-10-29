import { Prisma } from '@prisma/client';
import {
  toContentEntries,
  toContractPeriods,
  toDraftEntries,
  type DetailContentRow,
  type DetailContractRow,
} from './creator-detail.js';

// 2026-09-18 00:00 in Jakarta (UTC+7): the last instant of the 17th in UTC.
const TODAY = new Date('2026-09-17T17:00:00Z');

/** A calendar day relative to TODAY, the way Postgres `date` columns arrive (midnight UTC). */
function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 18 + offset));
}

/** `count` hand-ins, the newest made at `at` and sharing `link`. */
function handedIn(
  count: number,
  at = new Date('2026-09-01T03:00:00Z'),
  link = 'https://drive.example.com/draft-1',
): Pick<DetailContentRow, '_count' | 'submissions'> {
  return {
    _count: { submissions: count },
    submissions: count > 0 ? [{ link, created_at: at }] : [],
  };
}

function content(overrides: Partial<DetailContentRow> = {}): DetailContentRow {
  return {
    id: 'content-1',
    name: 'Evg_1_Ayu_01092026',
    type: 'evergreen',
    deadline: day(-10),
    status: 'scheduled',
    video_link: null,
    video_submitted_at: null,
    approval_bypassed: false,
    ...handedIn(0),
    ...overrides,
  };
}

function contract(
  id: string,
  start: number,
  end: number,
  contents: DetailContentRow[] = [],
): DetailContractRow {
  return {
    id,
    start_date: day(start),
    end_date: day(end),
    days_between: 14,
    content_quota: contents.length,
    fixed_rate: new Prisma.Decimal('1500000'),
    contract_type: 'regular',
    contents,
  };
}

describe('toContractPeriods', () => {
  it('answers no periods for a creator without a contract', () => {
    expect(toContractPeriods([], TODAY)).toEqual([]);
  });

  it('numbers the periods oldest first', () => {
    const periods = toContractPeriods(
      [contract('first', -200, -20), contract('second', -19, 160)],
      TODAY,
    );

    expect(periods.map((p) => [p.id, p.periodNumber])).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
  });

  it('describes the terms of each period in API vocabulary, its fixed rate as a number', () => {
    const row = contract('only', -30, 150, [content()]);
    row.fixed_rate = new Prisma.Decimal('3250000.50');

    const [period] = toContractPeriods([row], TODAY);

    expect(period).toMatchObject({
      id: 'only',
      startDate: '2026-08-19',
      endDate: '2027-02-15',
      daysBetween: 14,
      contentQuota: 1,
      fixedRate: 3250000.5,
      type: 'regular',
      status: 'active',
      isCurrent: true,
    });
  });

  it('leaves the content list to GET /contents?contract=, which pages and filters it', () => {
    const [period] = toContractPeriods(
      [contract('only', -30, 150, [content()])],
      TODAY,
    );

    expect(period).not.toHaveProperty('contents');
  });

  it('counts the Evergreen slots a period still has, Specific content aside', () => {
    const row = contract('only', -30, 150, [
      content({ id: 'a' }),
      content({ id: 'b', status: 'link_submitted' }),
      content({ id: 'c', type: 'specific' }),
    ]);
    row.content_quota = 4;

    expect(toContractPeriods([row], TODAY)[0].remainingEvergreenQuota).toBe(2);
  });

  it('never reports fewer than zero Evergreen slots left', () => {
    const row = contract('only', -30, 150, [
      content({ id: 'a' }),
      content({ id: 'b' }),
    ]);
    row.content_quota = 1;

    expect(toContractPeriods([row], TODAY)[0].remainingEvergreenQuota).toBe(0);
  });

  it('derives each period’s status from today in Jakarta', () => {
    const periods = toContractPeriods(
      [
        contract('ended', -200, -1),
        contract('running', 0, 100),
        contract('next', 101, 300),
      ],
      TODAY,
    );

    expect(periods.map((p) => p.status)).toEqual([
      'expired',
      'active',
      'upcoming',
    ]);
  });

  it('keeps a period active on its last day', () => {
    const [period] = toContractPeriods([contract('last-day', -30, 0)], TODAY);

    expect(period.status).toBe('active');
  });

  it('marks only the contract the creator is on today as current', () => {
    const periods = toContractPeriods(
      [contract('ended', -200, -1), contract('running', 0, 100)],
      TODAY,
    );

    expect(periods.map((p) => p.isCurrent)).toEqual([false, true]);
  });

  it('marks the latest finished contract current when none is running', () => {
    const periods = toContractPeriods(
      [contract('older', -400, -201), contract('latest', -200, -1)],
      TODAY,
    );

    expect(periods.map((p) => p.isCurrent)).toEqual([false, true]);
  });

  it('counts progress and performance per period, leaving a pending proposal out', () => {
    const [ended, running] = toContractPeriods(
      [
        contract('ended', -200, -20, [
          content({
            id: 'on-time',
            status: 'link_submitted',
            deadline: day(-30),
            video_submitted_at: day(-31),
            ...handedIn(1),
          }),
          content({
            id: 'late',
            status: 'link_submitted',
            deadline: day(-40),
            video_submitted_at: day(-38),
            ...handedIn(2),
          }),
        ]),
        contract('running', -19, 160, [
          content({ id: 'open', deadline: day(5) }),
          content({ id: 'proposal', status: 'pending', deadline: day(9) }),
        ]),
      ],
      TODAY,
    );

    expect(ended.progress).toEqual({ submitted: 2, total: 2, percent: 100 });
    expect(ended.completed).toBe(2);
    expect(ended.total).toBe(2);
    expect(ended.performance).toEqual({
      onTimeRate: 50,
      avgRevisions: 0.5,
      productivity: 'watch',
      productivityLabel: 'Perlu Perhatian',
    });

    expect(running.progress).toEqual({ submitted: 0, total: 1, percent: 0 });
    expect(running.total).toBe(1);
    expect(running.performance.productivity).toBe('no_data');
  });

  it('reads an upcoming period with nothing resolved as having no data yet', () => {
    const [period] = toContractPeriods(
      [contract('next', 10, 200, [content({ deadline: day(30) })])],
      TODAY,
    );

    expect(period.performance).toEqual({
      onTimeRate: null,
      avgRevisions: 0,
      productivity: 'no_data',
      productivityLabel: 'Belum Ada Data',
    });
  });
});

describe('toContentEntries', () => {
  function only(row: DetailContentRow) {
    return toContentEntries(contract('c', -30, 150, [row]), TODAY)[0];
  }

  it('lists a contract’s contents in the flat shape the old detail modal reads', () => {
    expect(
      only(
        content({
          id: 'x',
          name: 'Spc_Launch',
          type: 'specific',
          deadline: day(3),
          status: 'draft_review',
          ...handedIn(2, new Date('2026-09-12T09:30:00Z')),
        }),
      ),
    ).toEqual({
      id: 'x',
      name: 'Spc_Launch',
      type: 'specific',
      deadline: '2026-09-21',
      status: 'draft_review',
      outcome: 'open',
      tags: [],
      videoLink: null,
    });
  });

  it('carries the final video and judges a late link', () => {
    expect(
      only(
        content({
          status: 'link_submitted',
          deadline: day(-2),
          video_link: 'https://www.tiktok.com/@ayu/video/1',
          video_submitted_at: day(-1),
        }),
      ),
    ).toMatchObject({
      videoLink: 'https://www.tiktok.com/@ayu/video/1',
      outcome: 'submitted_late',
      tags: ['overdue'],
    });
  });

  it('flags a missed deadline as overdue and late', () => {
    const row = only(content({ deadline: day(-1) }));

    expect(row.outcome).toBe('late');
    expect(row.tags).toEqual(['overdue']);
  });

  it('flags a draft handed in after the deadline from the newest hand-in', () => {
    const row = only(
      content({
        status: 'draft_review',
        deadline: day(-5),
        ...handedIn(2, day(-3)),
      }),
    );

    expect(row.tags).toEqual(['overdue']);
  });

  it('keeps the deadline day itself open', () => {
    const row = only(content({ deadline: day(0) }));

    expect(row.outcome).toBe('open');
    expect(row.tags).toEqual([]);
  });

  it('reports a stored approval bypass', () => {
    expect(only(content({ approval_bypassed: true })).tags).toContain(
      'approval_bypassed',
    );
  });

  it('keeps several contents due the same day in the order they arrive', () => {
    const rows = toContentEntries(
      contract('c', -30, 150, [
        content({ id: 'a', deadline: day(4) }),
        content({ id: 'b', deadline: day(4) }),
      ]),
      TODAY,
    );

    expect(rows.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('toDraftEntries', () => {
  it('lists only handed-in contents, each with its newest draft and revisions', () => {
    const drafts = toDraftEntries(
      contract('c', -30, 150, [
        content({
          id: 'a',
          name: 'Evg_1',
          ...handedIn(3, new Date('2026-09-12T09:30:00Z'), 'https://d/v3'),
        }),
        content({ id: 'b', name: 'Evg_2' }),
        content({
          id: 'c',
          name: 'Evg_3',
          ...handedIn(1, new Date('2026-09-02T01:00:00Z'), 'https://d/v1'),
        }),
      ]),
    );

    expect(drafts).toEqual([
      {
        contentId: 'a',
        contentName: 'Evg_1',
        revisionCount: 2,
        latestLink: 'https://d/v3',
        lastSubmittedAt: '2026-09-12',
      },
      {
        contentId: 'c',
        contentName: 'Evg_3',
        revisionCount: 0,
        latestLink: 'https://d/v1',
        lastSubmittedAt: '2026-09-02',
      },
    ]);
  });
});
