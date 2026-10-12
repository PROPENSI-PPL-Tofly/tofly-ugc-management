import {
  toContractPeriods,
  type DetailContentRow,
  type DetailContractRow,
  type DetailSubmissionRow,
} from './creator-detail.js';

// 2026-09-18 00:00 in Jakarta (UTC+7): the last instant of the 17th in UTC.
const TODAY = new Date('2026-09-17T17:00:00Z');

/** A calendar day relative to TODAY, the way Postgres `date` columns arrive (midnight UTC). */
function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 18 + offset));
}

function submission(
  overrides: Partial<DetailSubmissionRow> = {},
): DetailSubmissionRow {
  return {
    id: 'sub-1',
    link: 'https://drive.example.com/draft-1',
    revision_notes: null,
    created_at: new Date('2026-09-01T03:00:00Z'),
    ...overrides,
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
    submissions: [],
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
    contract_type: 'regular',
    contents,
  };
}

describe('toContractPeriods', () => {
  it('answers no periods for a creator without a contract', () => {
    expect(toContractPeriods([], TODAY)).toEqual([]);
  });

  it('nests each contract’s own contents under its period, numbered oldest first', () => {
    const periods = toContractPeriods(
      [
        contract('first', -200, -20, [content({ id: 'old' })]),
        contract('second', -19, 160, [
          content({ id: 'new-a', deadline: day(5) }),
          content({ id: 'new-b', deadline: day(19) }),
        ]),
      ],
      TODAY,
    );

    expect(periods.map((p) => [p.id, p.periodNumber])).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
    expect(periods[0].contents.map((c) => c.id)).toEqual(['old']);
    expect(periods[1].contents.map((c) => c.id)).toEqual(['new-a', 'new-b']);
  });

  it('describes the terms of each period in API vocabulary', () => {
    const [period] = toContractPeriods(
      [contract('only', -30, 150, [content()])],
      TODAY,
    );

    expect(period).toMatchObject({
      id: 'only',
      startDate: '2026-08-19',
      endDate: '2027-02-15',
      daysBetween: 14,
      contentQuota: 1,
      type: 'regular',
      status: 'active',
      isCurrent: true,
    });
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
            submissions: [submission()],
          }),
          content({
            id: 'late',
            status: 'link_submitted',
            deadline: day(-40),
            video_submitted_at: day(-38),
            submissions: [
              submission({ id: 's1', revision_notes: 'Ganti musik' }),
              submission({ id: 's2' }),
            ],
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
    // Excluded from the numbers, but still listed so the admin can answer it.
    expect(running.contents.map((c) => c.id)).toEqual(['open', 'proposal']);
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

  describe('each content', () => {
    function only(row: DetailContentRow) {
      return toContractPeriods([contract('c', -30, 150, [row])], TODAY)[0]
        .contents[0];
    }

    it('summarises where the content is in its lifecycle', () => {
      expect(
        only(
          content({
            id: 'x',
            name: 'Spc_Launch',
            type: 'specific',
            deadline: day(3),
            status: 'draft_review',
            submissions: [
              submission({
                id: 'a',
                link: 'https://drive.example.com/v1',
                revision_notes: 'Perjelas logo',
                created_at: new Date('2026-09-10T02:00:00Z'),
              }),
              submission({
                id: 'b',
                link: 'https://drive.example.com/v2',
                created_at: new Date('2026-09-12T09:30:00Z'),
              }),
            ],
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
        waitingOn: 'admin',
        revisionCount: 1,
        latestDraft: {
          link: 'https://drive.example.com/v2',
          submittedAt: '2026-09-12T09:30:00.000Z',
        },
        videoLink: null,
        videoSubmittedAt: null,
      });
    });

    it('has no latest draft before anything was handed in', () => {
      const row = only(content());

      expect(row.latestDraft).toBeNull();
      expect(row.revisionCount).toBe(0);
      expect(row.waitingOn).toBe('creator');
    });

    it('carries the final video and waits on nobody once the link is in', () => {
      const row = only(
        content({
          status: 'link_submitted',
          deadline: day(-2),
          video_link: 'https://www.tiktok.com/@ayu/video/1',
          video_submitted_at: day(-1),
        }),
      );

      expect(row).toMatchObject({
        videoLink: 'https://www.tiktok.com/@ayu/video/1',
        videoSubmittedAt: '2026-09-17',
        outcome: 'submitted_late',
        tags: ['late_submission'],
        waitingOn: null,
      });
    });

    it('flags a missed deadline as overdue and late', () => {
      const row = only(content({ deadline: day(-1) }));

      expect(row.outcome).toBe('late');
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

    it('counts only the hand-ins an admin asked to revise', () => {
      const row = only(
        content({
          status: 'draft_revision',
          submissions: [
            submission({ id: 'a', revision_notes: 'Satu' }),
            submission({ id: 'b', revision_notes: 'Dua' }),
            submission({ id: 'c' }),
          ],
        }),
      );

      expect(row.revisionCount).toBe(2);
    });

    it('lists several contents due the same day in the order they arrive', () => {
      const periods = toContractPeriods(
        [
          contract('c', -30, 150, [
            content({ id: 'a', deadline: day(4) }),
            content({ id: 'b', deadline: day(4) }),
          ]),
        ],
        TODAY,
      );

      expect(periods[0].contents.map((c) => c.id)).toEqual(['a', 'b']);
    });
  });
});
