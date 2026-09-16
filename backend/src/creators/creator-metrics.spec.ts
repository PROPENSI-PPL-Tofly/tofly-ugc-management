import {
  computePerformance,
  computeProgress,
  contentOutcome,
  currentContract,
  daysRemaining,
  isContractActive,
  type MetricsContent,
  type MetricsContract,
} from './creator-metrics.js';

const TODAY = new Date('2026-09-16T00:00:00.000Z');

function day(offset: number): Date {
  const date = new Date(TODAY);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

function content(overrides: Partial<MetricsContent> = {}): MetricsContent {
  return {
    deadline: day(-10),
    videoSubmittedAt: day(-12),
    isProposal: false,
    submissionCount: 1,
    ...overrides,
  };
}

function contract(overrides: Partial<MetricsContract> = {}): MetricsContract {
  return {
    id: 'contract-1',
    startDate: day(-100),
    endDate: day(100),
    contents: [],
    ...overrides,
  };
}

describe('isContractActive', () => {
  it('is active while today sits inside the period', () => {
    expect(isContractActive(contract(), TODAY)).toBe(true);
  });

  it('is active on the first and the last day', () => {
    expect(isContractActive(contract({ startDate: TODAY }), TODAY)).toBe(true);
    expect(isContractActive(contract({ endDate: TODAY }), TODAY)).toBe(true);
  });

  it('is not active once the end date has passed', () => {
    expect(
      isContractActive(contract({ startDate: day(-100), endDate: day(-1) }), TODAY),
    ).toBe(false);
  });

  it('is not active before the start date', () => {
    expect(
      isContractActive(contract({ startDate: day(1), endDate: day(100) }), TODAY),
    ).toBe(false);
  });
});

describe('currentContract', () => {
  it('returns null when the creator has no contract at all', () => {
    expect(currentContract([], TODAY)).toBeNull();
  });

  it('prefers the period that contains today over a finished one', () => {
    const finished = contract({ id: 'old', startDate: day(-400), endDate: day(-200) });
    const live = contract({ id: 'live' });

    expect(currentContract([finished, live], TODAY)?.id).toBe('live');
  });

  it('falls back to the most recently finished period', () => {
    const older = contract({ id: 'older', startDate: day(-400), endDate: day(-300) });
    const newer = contract({ id: 'newer', startDate: day(-200), endDate: day(-30) });

    expect(currentContract([older, newer], TODAY)?.id).toBe('newer');
  });

  it('falls back to the earliest upcoming period when none has started', () => {
    const soon = contract({ id: 'soon', startDate: day(10), endDate: day(200) });
    const later = contract({ id: 'later', startDate: day(220), endDate: day(400) });

    expect(currentContract([later, soon], TODAY)?.id).toBe('soon');
  });
});

describe('daysRemaining', () => {
  it('counts the days left in a running contract', () => {
    expect(daysRemaining(contract({ endDate: day(30) }), TODAY)).toBe(30);
  });

  it('is zero on the final day', () => {
    expect(daysRemaining(contract({ endDate: TODAY }), TODAY)).toBe(0);
  });

  it('goes negative once the contract has ended', () => {
    expect(daysRemaining(contract({ endDate: day(-5) }), TODAY)).toBe(-5);
  });
});

describe('contentOutcome', () => {
  it('is on_time when the video landed on or before the deadline', () => {
    expect(contentOutcome(content({ deadline: day(-10), videoSubmittedAt: day(-12) }), TODAY)).toBe(
      'on_time',
    );
    expect(contentOutcome(content({ deadline: day(-10), videoSubmittedAt: day(-10) }), TODAY)).toBe(
      'on_time',
    );
  });

  it('is submitted_late when the video landed after the deadline', () => {
    expect(contentOutcome(content({ deadline: day(-10), videoSubmittedAt: day(-8) }), TODAY)).toBe(
      'submitted_late',
    );
  });

  it('is late when the deadline passed with nothing submitted', () => {
    expect(contentOutcome(content({ deadline: day(-1), videoSubmittedAt: null }), TODAY)).toBe(
      'late',
    );
  });

  it('is open on the deadline day itself', () => {
    expect(contentOutcome(content({ deadline: TODAY, videoSubmittedAt: null }), TODAY)).toBe('open');
  });

  it('is open while the deadline is still ahead', () => {
    expect(contentOutcome(content({ deadline: day(7), videoSubmittedAt: null }), TODAY)).toBe(
      'open',
    );
  });
});

describe('computeProgress', () => {
  it('counts submitted content against the total', () => {
    const contents = [
      content({ videoSubmittedAt: day(-12) }),
      content({ videoSubmittedAt: day(-6) }),
      content({ deadline: day(20), videoSubmittedAt: null }),
      content({ deadline: day(40), videoSubmittedAt: null }),
    ];

    expect(computeProgress(contents)).toEqual({ submitted: 2, total: 4, percent: 50 });
  });

  it('ignores proposals that have not been accepted yet', () => {
    const contents = [
      content({ videoSubmittedAt: day(-12) }),
      content({ isProposal: true, videoSubmittedAt: null, deadline: day(20) }),
    ];

    expect(computeProgress(contents)).toEqual({ submitted: 1, total: 1, percent: 100 });
  });

  it('reports zero rather than dividing by nothing', () => {
    expect(computeProgress([])).toEqual({ submitted: 0, total: 0, percent: 0 });
  });
});

describe('computePerformance', () => {
  it('has no data when the creator has no contract', () => {
    expect(computePerformance(null, TODAY)).toEqual({
      onTimeRate: null,
      avgRevisions: 0,
      productivity: 'watch',
      productivityLabel: 'Belum Ada Data',
    });
  });

  it('has no data while every deadline is still ahead', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(10), videoSubmittedAt: null, submissionCount: 0 }),
        content({ deadline: day(24), videoSubmittedAt: null, submissionCount: 0 }),
      ],
    });

    expect(computePerformance(subject, TODAY)).toEqual({
      onTimeRate: null,
      avgRevisions: 0,
      productivity: 'watch',
      productivityLabel: 'Belum Ada Data',
    });
  });

  it('rates a punctual creator with few revisions as good', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(-40), videoSubmittedAt: day(-42), submissionCount: 1 }),
        content({ deadline: day(-20), videoSubmittedAt: day(-25), submissionCount: 2 }),
        content({ deadline: day(20), videoSubmittedAt: null, submissionCount: 0 }),
      ],
    });

    expect(computePerformance(subject, TODAY)).toEqual({
      onTimeRate: 100,
      avgRevisions: 0.5,
      productivity: 'good',
      productivityLabel: 'Baik',
    });
  });

  it('still rates good at exactly the 80 percent boundary', () => {
    const contents = [
      ...Array.from({ length: 4 }, () =>
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 1 }),
      ),
      content({ deadline: day(-20), videoSubmittedAt: null, submissionCount: 1 }),
    ];

    const result = computePerformance(contract({ contents }), TODAY);

    expect(result.onTimeRate).toBe(80);
    expect(result.productivity).toBe('good');
  });

  it('drops to watch just below the 80 percent boundary', () => {
    const contents = [
      ...Array.from({ length: 3 }, () =>
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 1 }),
      ),
      content({ deadline: day(-20), videoSubmittedAt: null, submissionCount: 1 }),
    ];

    const result = computePerformance(contract({ contents }), TODAY);

    expect(result.onTimeRate).toBe(75);
    expect(result.productivity).toBe('watch');
    expect(result.productivityLabel).toBe('Perlu Perhatian');
  });

  it('counts a late hand-in against the on-time rate', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 1 }),
        content({ deadline: day(-20), videoSubmittedAt: day(-18), submissionCount: 1 }),
      ],
    });

    expect(computePerformance(subject, TODAY).onTimeRate).toBe(50);
  });

  it('rates anything under 40 percent as a risk', () => {
    const contents = [
      content({ deadline: day(-60), videoSubmittedAt: day(-62), submissionCount: 1 }),
      content({ deadline: day(-40), videoSubmittedAt: null, submissionCount: 0 }),
      content({ deadline: day(-20), videoSubmittedAt: null, submissionCount: 0 }),
    ];

    const result = computePerformance(contract({ contents }), TODAY);

    expect(result.onTimeRate).toBe(33);
    expect(result.productivity).toBe('risk');
    expect(result.productivityLabel).toBe('Berisiko');
  });

  it('rates more than two revisions per content as a risk even when punctual', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 4 }),
        content({ deadline: day(-20), videoSubmittedAt: day(-21), submissionCount: 4 }),
      ],
    });

    const result = computePerformance(subject, TODAY);

    expect(result.avgRevisions).toBe(3);
    expect(result.productivity).toBe('risk');
  });

  it('still counts two revisions per content as merely watch-worthy', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 3 }),
        content({ deadline: day(-20), videoSubmittedAt: day(-21), submissionCount: 3 }),
      ],
    });

    const result = computePerformance(subject, TODAY);

    expect(result.avgRevisions).toBe(2);
    expect(result.productivity).toBe('watch');
  });

  it('averages revisions only over content that was actually handed in', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 3 }),
        content({ deadline: day(20), videoSubmittedAt: null, submissionCount: 0 }),
      ],
    });

    expect(computePerformance(subject, TODAY).avgRevisions).toBe(2);
  });

  it('leaves proposals out of both figures', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 1 }),
        content({
          deadline: day(-30),
          videoSubmittedAt: null,
          submissionCount: 5,
          isProposal: true,
        }),
      ],
    });

    expect(computePerformance(subject, TODAY)).toEqual({
      onTimeRate: 100,
      avgRevisions: 0,
      productivity: 'good',
      productivityLabel: 'Baik',
    });
  });

  it('rounds the revision average to two decimals', () => {
    const subject = contract({
      contents: [
        content({ deadline: day(-40), videoSubmittedAt: day(-41), submissionCount: 1 }),
        content({ deadline: day(-30), videoSubmittedAt: day(-31), submissionCount: 1 }),
        content({ deadline: day(-20), videoSubmittedAt: day(-21), submissionCount: 2 }),
      ],
    });

    expect(computePerformance(subject, TODAY).avgRevisions).toBe(0.33);
  });
});
