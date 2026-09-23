import {
  computePerformance,
  computeProgress,
  contentOutcome,
  contractStatus,
  currentContract,
  daysRemaining,
  periodNumber,
  type MetricsContent,
  type MetricsContract,
} from './creator-metrics.js';

const TODAY = new Date('2026-09-18T00:00:00Z');

/** A calendar day relative to TODAY, the way Postgres `date` columns arrive (midnight UTC). */
function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 18 + offset));
}

function content(overrides: Partial<MetricsContent> = {}): MetricsContent {
  return {
    deadline: day(-10),
    videoSubmittedAt: day(-10),
    isProposal: false,
    submissionCount: 1,
    ...overrides,
  };
}

function contract(
  id: string,
  start: number,
  end: number,
  contents: MetricsContent[] = [],
): MetricsContract {
  return { id, startDate: day(start), endDate: day(end), contents };
}

describe('contractStatus', () => {
  it('is active between the start and end dates inclusive', () => {
    expect(contractStatus(contract('a', -30, 30), TODAY)).toBe('active');
    expect(contractStatus(contract('a', 0, 30), TODAY)).toBe('active');
    expect(contractStatus(contract('a', -30, 0), TODAY)).toBe('active');
  });

  it('is expired the day after the end date', () => {
    expect(contractStatus(contract('a', -30, -1), TODAY)).toBe('expired');
  });

  it('is upcoming before the start date', () => {
    expect(contractStatus(contract('a', 1, 30), TODAY)).toBe('upcoming');
  });

  it('is none without a contract', () => {
    expect(contractStatus(null, TODAY)).toBe('none');
  });

  it('ignores the time of day on the reference date', () => {
    const lateEvening = new Date('2026-09-18T23:59:59Z');
    expect(contractStatus(contract('a', -30, 0), lateEvening)).toBe('active');
  });
});

describe('currentContract', () => {
  it('returns null for a creator without contracts', () => {
    expect(currentContract([], TODAY)).toBeNull();
  });

  it('prefers the contract running today', () => {
    const running = contract('running', -10, 10);
    expect(currentContract([contract('old', -200, -100), running], TODAY)).toBe(
      running,
    );
  });

  it('falls back to the most recently finished contract', () => {
    const latest = contract('latest', -90, -20);
    const contracts = [
      contract('older', -400, -300),
      latest,
      contract('oldest', -700, -600),
    ];
    expect(currentContract(contracts, TODAY)).toBe(latest);
  });

  it('shows the earliest upcoming contract when nothing has run yet', () => {
    const first = contract('first', 5, 60);
    expect(currentContract([contract('later', 90, 150), first], TODAY)).toBe(
      first,
    );
  });

  it('prefers a finished contract over an upcoming one', () => {
    const finished = contract('finished', -90, -20);
    expect(currentContract([contract('next', 10, 100), finished], TODAY)).toBe(
      finished,
    );
  });
});

describe('periodNumber', () => {
  it('is 1 for the first contract', () => {
    const only = contract('a', -10, 10);
    expect(periodNumber([only], only)).toBe(1);
  });

  it('counts the contracts that started before the current one', () => {
    const third = contract('c', -10, 10);
    const contracts = [
      third,
      contract('a', -400, -300),
      contract('b', -200, -100),
    ];
    expect(periodNumber(contracts, third)).toBe(3);
  });

  it('does not count contracts that start later', () => {
    const current = contract('a', -10, 10);
    expect(periodNumber([current, contract('b', 20, 40)], current)).toBe(1);
  });
});

describe('daysRemaining', () => {
  it('counts the days until the end date', () => {
    expect(daysRemaining(contract('a', -10, 12), TODAY)).toBe(12);
  });

  it('is zero on the final day', () => {
    expect(daysRemaining(contract('a', -10, 0), TODAY)).toBe(0);
  });

  it('goes negative once the contract has ended', () => {
    expect(daysRemaining(contract('a', -30, -3), TODAY)).toBe(-3);
  });
});

describe('contentOutcome', () => {
  it('is on time when the video was handed in by the deadline', () => {
    expect(
      contentOutcome(
        content({ deadline: day(-5), videoSubmittedAt: day(-5) }),
        TODAY,
      ),
    ).toBe('on_time');
    expect(
      contentOutcome(
        content({ deadline: day(-5), videoSubmittedAt: day(-7) }),
        TODAY,
      ),
    ).toBe('on_time');
  });

  it('is submitted late when the video came after the deadline', () => {
    expect(
      contentOutcome(
        content({ deadline: day(-5), videoSubmittedAt: day(-4) }),
        TODAY,
      ),
    ).toBe('submitted_late');
  });

  it('is late once the deadline has passed without a video', () => {
    expect(
      contentOutcome(
        content({ deadline: day(-1), videoSubmittedAt: null }),
        TODAY,
      ),
    ).toBe('late');
  });

  it('is still open on the deadline day itself and before', () => {
    expect(
      contentOutcome(
        content({ deadline: day(0), videoSubmittedAt: null }),
        TODAY,
      ),
    ).toBe('open');
    expect(
      contentOutcome(
        content({ deadline: day(3), videoSubmittedAt: null }),
        TODAY,
      ),
    ).toBe('open');
  });
});

describe('computeProgress', () => {
  it('counts submitted videos against committed content', () => {
    const contents = [
      content({ videoSubmittedAt: day(-3) }),
      content({ videoSubmittedAt: null }),
      content({ videoSubmittedAt: null }),
    ];
    expect(computeProgress(contents)).toEqual({
      submitted: 1,
      total: 3,
      percent: 33,
    });
  });

  it('leaves proposals out until an admin accepts them', () => {
    const contents = [
      content(),
      content({ isProposal: true, videoSubmittedAt: null }),
    ];
    expect(computeProgress(contents)).toEqual({
      submitted: 1,
      total: 1,
      percent: 100,
    });
  });

  it('is zero without content rather than dividing by zero', () => {
    expect(computeProgress([])).toEqual({ submitted: 0, total: 0, percent: 0 });
  });
});

describe('computePerformance', () => {
  it('reports no data for a creator without a contract', () => {
    expect(computePerformance(null, TODAY)).toEqual({
      onTimeRate: null,
      avgRevisions: 0,
      productivity: 'watch',
      productivityLabel: 'Belum Ada Data',
    });
  });

  it('reports no data while nothing is resolved and nothing was handed in', () => {
    const open = contract('a', -10, 60, [
      content({ deadline: day(5), videoSubmittedAt: null, submissionCount: 0 }),
    ]);
    expect(computePerformance(open, TODAY).productivityLabel).toBe(
      'Belum Ada Data',
    );
  });

  it('rates a reliable creator as Baik', () => {
    const good = contract('a', -100, 80, [
      content({ deadline: day(-80), videoSubmittedAt: day(-82) }),
      content({ deadline: day(-60), videoSubmittedAt: day(-60) }),
      content({ deadline: day(-40), videoSubmittedAt: day(-40) }),
      content({ deadline: day(-20), videoSubmittedAt: day(-20) }),
      content({
        deadline: day(-10),
        videoSubmittedAt: day(-8),
        submissionCount: 2,
      }),
      content({
        deadline: day(20),
        videoSubmittedAt: null,
        submissionCount: 1,
      }),
    ]);
    expect(computePerformance(good, TODAY)).toEqual({
      onTimeRate: 80,
      avgRevisions: 0.17,
      productivity: 'good',
      productivityLabel: 'Baik',
    });
  });

  it('rates a creator with no late deliveries but no resolved work as Baik once drafts exist', () => {
    const drafting = contract('a', -10, 60, [
      content({ deadline: day(5), videoSubmittedAt: null, submissionCount: 1 }),
    ]);
    expect(computePerformance(drafting, TODAY)).toMatchObject({
      onTimeRate: null,
      avgRevisions: 0,
      productivity: 'good',
    });
  });

  it('rates a creator who misses most deadlines as Berisiko', () => {
    const risky = contract('a', -90, 90, [
      content({ deadline: day(-70), videoSubmittedAt: day(-70) }),
      content({ deadline: day(-50), videoSubmittedAt: day(-45) }),
      content({ deadline: day(-30), videoSubmittedAt: day(-20) }),
      content({ deadline: day(-10), videoSubmittedAt: null }),
    ]);
    expect(computePerformance(risky, TODAY)).toMatchObject({
      onTimeRate: 25,
      productivity: 'risk',
      productivityLabel: 'Berisiko',
    });
  });

  it('rates a creator who needs many revisions as Berisiko even when on time', () => {
    const revised = contract('a', -90, 90, [
      content({
        deadline: day(-30),
        videoSubmittedAt: day(-30),
        submissionCount: 4,
      }),
      content({
        deadline: day(-10),
        videoSubmittedAt: day(-10),
        submissionCount: 3,
      }),
    ]);
    expect(computePerformance(revised, TODAY)).toMatchObject({
      onTimeRate: 100,
      avgRevisions: 2.5,
      productivity: 'risk',
    });
  });

  it('rates everything in between as Perlu Perhatian', () => {
    const middling = contract('a', -90, 90, [
      content({
        deadline: day(-60),
        videoSubmittedAt: day(-60),
        submissionCount: 2,
      }),
      content({
        deadline: day(-40),
        videoSubmittedAt: day(-38),
        submissionCount: 1,
      }),
      content({
        deadline: day(-20),
        videoSubmittedAt: day(-20),
        submissionCount: 3,
      }),
      content({
        deadline: day(-5),
        videoSubmittedAt: day(-3),
        submissionCount: 2,
      }),
      content({
        deadline: day(-1),
        videoSubmittedAt: day(-1),
        submissionCount: 1,
      }),
    ]);
    expect(computePerformance(middling, TODAY)).toEqual({
      onTimeRate: 60,
      avgRevisions: 0.8,
      productivity: 'watch',
      productivityLabel: 'Perlu Perhatian',
    });
  });

  it('ignores proposals when judging performance', () => {
    const withProposal = contract('a', -90, 90, [
      content({ deadline: day(-30), videoSubmittedAt: day(-30) }),
      content({
        deadline: day(-10),
        videoSubmittedAt: null,
        isProposal: true,
        submissionCount: 5,
      }),
    ]);
    expect(computePerformance(withProposal, TODAY)).toMatchObject({
      onTimeRate: 100,
      avgRevisions: 0,
      productivity: 'good',
    });
  });
});
