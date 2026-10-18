import { content, context, day, FORMULA } from './invoice-test-data.js';
import { PerformanceBonusComponent } from './performance-bonus.component.js';

const component = new PerformanceBonusComponent();

function delivered(overrides: Parameters<typeof content>[0] = {}) {
  return content({
    status: 'link_submitted',
    videoSubmittedAt: day(-1),
    deadline: day(0),
    platform: 'instagram',
    ...overrides,
  });
}

describe('PerformanceBonusComponent', () => {
  it('waits for data, with no amount, while no delivered item has been measured', () => {
    const result = component.calculate(
      context({ contents: [delivered({ views: null })] }),
    );

    expect(result).toEqual({
      key: 'performanceBonus',
      amount: null,
      status: 'waiting_for_data',
      lines: [],
    });
  });

  it('waits for data when nothing has been delivered yet', () => {
    expect(component.calculate(context()).status).toBe('waiting_for_data');
  });

  it('pays the highest tier reached, not the sum of every tier passed', () => {
    const result = component.calculate(
      context({ contents: [delivered({ views: 41_200 })] }),
    );

    expect(result.amount).toBe(400_000);
    expect(result.lines[0].basis).toEqual({
      platform: 'instagram',
      metric: 'views',
      value: 41_200,
      tier: 2,
    });
  });

  it('pays a tier at exactly its minimum and nothing one below it', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered({ id: 'a', views: 10_000 }),
          delivered({ id: 'b', views: 9_999 }),
        ],
      }),
    );

    expect(
      result.lines.map((line) => [line.contentId, line.basis.tier]),
    ).toEqual([['a', 1]]);
    expect(result.amount).toBe(150_000);
  });

  it('reads each platform on its own metric', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered({ platform: 'tiktok', views: 99_999, likes: 1_000 }),
        ],
      }),
    );

    expect(result.amount).toBe(50_000);
    expect(result.lines[0].basis.metric).toBe('likes');
  });

  it('is calculated at zero once data exists but no item reaches a tier', () => {
    const result = component.calculate(
      context({ contents: [delivered({ views: 500 })] }),
    );

    expect(result.status).toBe('calculated');
    expect(result.amount).toBe(0);
  });

  it('pays no bonus on a platform the formula has no tiers for', () => {
    const result = component.calculate(
      context({
        formula: { ...FORMULA, performanceBonus: {} },
        contents: [delivered({ views: 50_000 })],
      }),
    );

    expect(result.status).toBe('waiting_for_data');
  });

  it('gives a late Specific item no bonus, as it loses its fee', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered({
            type: 'specific',
            deadline: day(-3),
            videoSubmittedAt: day(-1),
            views: 50_000,
          }),
        ],
      }),
    );

    expect(result.lines).toEqual([]);
  });

  it('skips content that has no platform or is not delivered', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered({ id: 'a', platform: null, views: 50_000 }),
          delivered({ id: 'b', status: 'draft_approved', views: 50_000 }),
        ],
      }),
    );

    expect(result.status).toBe('waiting_for_data');
  });

  it('waits for data on a metric the contents table has no column for yet', () => {
    const result = component.calculate(
      context({
        formula: {
          ...FORMULA,
          performanceBonus: {
            instagram: {
              metric: 'comments',
              tiers: [{ threshold: 10, bonus: 50_000 }],
            },
          },
        },
        contents: [delivered({ views: 50_000, likes: 5_000 })],
      }),
    );

    expect(result).toMatchObject({ amount: null, status: 'waiting_for_data' });
  });

  it('waits for data while one delivered item is still unmeasured, keeping the known lines', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered({ id: 'measured', views: 50_000 }),
          delivered({ id: 'pending', views: null }),
        ],
      }),
    );

    expect(result.status).toBe('waiting_for_data');
    expect(result.amount).toBeNull();
    expect(result.lines.map((line) => line.contentId)).toEqual(['measured']);
  });

  it('waits for a formula while none is saved', () => {
    const result = component.calculate(
      context({ formula: null, contents: [delivered({ views: 50_000 })] }),
    );

    expect(result.status).toBe('waiting_for_data');
  });
});
