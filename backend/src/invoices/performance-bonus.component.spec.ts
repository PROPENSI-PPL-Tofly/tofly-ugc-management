import type { InvoiceLink } from './invoice-component.js';
import { content, context, day, FORMULA, link } from './invoice-test-data.js';
import { PerformanceBonusComponent } from './performance-bonus.component.js';

const component = new PerformanceBonusComponent();

const SYNCED_AT = new Date('2026-09-17T19:00:00.000Z');

function delivered(
  links: InvoiceLink[],
  overrides: Parameters<typeof content>[0] = {},
) {
  return content({
    status: 'link_submitted',
    videoSubmittedAt: day(-1),
    deadline: day(0),
    links,
    ...overrides,
  });
}

describe('PerformanceBonusComponent', () => {
  it('waits for data, with no amount, while no delivered link has been measured', () => {
    const result = component.calculate(
      context({ contents: [delivered([link('instagram')])] }),
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

  it('pays the highest tier reached, with the platform, metric, value, tier, source and sync time (AC 1, 6)', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([
            link('instagram', {
              views: 41_200,
              state: 'synced',
              lastSyncedAt: SYNCED_AT,
            }),
          ]),
        ],
      }),
    );

    expect(result.amount).toBe(400_000);
    expect(result.lines).toEqual([
      {
        contentId: 'content-1',
        contentName: 'Evg_1_RanggaPratama',
        amount: 400_000,
        basis: {
          platform: 'instagram',
          metric: 'views',
          value: 41_200,
          tier: 2,
          source: 'synced',
          lastSyncedAt: '2026-09-17T19:00:00.000Z',
        },
      },
    ]);
  });

  it('says a link an admin filled in came from manual input, with no sync time', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([link('instagram', { views: 12_000, state: 'manual' })]),
        ],
      }),
    );

    expect(result.lines[0].basis).toEqual({
      platform: 'instagram',
      metric: 'views',
      value: 12_000,
      tier: 1,
      source: 'manual',
    });
  });

  it('pays a tier at exactly its minimum and nothing one below it', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([link('instagram', { views: 10_000 })], { id: 'a' }),
          delivered([link('instagram', { views: 9_999 })], { id: 'b' }),
        ],
      }),
    );

    expect(
      result.lines.map((line) => [line.contentId, line.basis.tier]),
    ).toEqual([['a', 1]]);
    expect(result.amount).toBe(150_000);
  });

  it('reads each link on its own platform metric', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([link('tiktok', { views: 99_999, likes: 1_000 })]),
        ],
      }),
    );

    expect(result.amount).toBe(50_000);
    expect(result.lines[0].basis.metric).toBe('likes');
  });

  it('adds up the bonus of every link of a cross-posted content, one line each (AC 2)', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([
            link('instagram', { views: 41_200 }),
            link('tiktok', { likes: 1_500 }),
          ]),
        ],
      }),
    );

    expect(result).toMatchObject({ status: 'calculated', amount: 450_000 });
    expect(
      result.lines.map((line) => [line.basis.platform, line.amount]),
    ).toEqual([
      ['instagram', 400_000],
      ['tiktok', 50_000],
    ]);
  });

  it('reads comments and shares too, now that each link keeps them', () => {
    const result = component.calculate(
      context({
        formula: {
          ...FORMULA,
          performanceBonus: {
            instagram: {
              metric: 'comments',
              tiers: [{ threshold: 10, bonus: 50_000 }],
            },
            tiktok: {
              metric: 'shares',
              tiers: [{ threshold: 5, bonus: 20_000 }],
            },
          },
        },
        contents: [
          delivered([
            link('instagram', { views: 1, comments: 12 }),
            link('tiktok', { likes: 1, shares: 5 }),
          ]),
        ],
      }),
    );

    expect(result).toMatchObject({ status: 'calculated', amount: 70_000 });
  });

  it('is calculated at zero once data exists but no link reaches a tier', () => {
    const result = component.calculate(
      context({ contents: [delivered([link('instagram', { views: 500 })])] }),
    );

    expect(result.status).toBe('calculated');
    expect(result.amount).toBe(0);
  });

  it.each([
    ['no rule at all', {}],
    [
      'a rule with no tiers',
      { instagram: { metric: 'views' as const, tiers: [] } },
    ],
  ])(
    'pays nothing, without waiting, on a platform with %s (AC 4)',
    (_label, performanceBonus) => {
      const result = component.calculate(
        context({
          formula: { ...FORMULA, performanceBonus },
          contents: [delivered([link('instagram')])],
        }),
      );

      expect(result).toEqual({
        key: 'performanceBonus',
        amount: 0,
        status: 'calculated',
        lines: [],
      });
    },
  );

  it('gives a late Specific item no bonus on any of its links (AC 3)', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered(
            [
              link('instagram', { views: 50_000 }),
              link('tiktok', { likes: 5_000 }),
            ],
            { type: 'specific', deadline: day(-3), videoSubmittedAt: day(-1) },
          ),
        ],
      }),
    );

    expect(result.lines).toEqual([]);
  });

  it('still pays a late Evergreen item its bonus: only a late Specific item loses it (AC 3)', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([link('instagram', { views: 12_000 })], {
            type: 'evergreen',
            deadline: day(-10),
            videoSubmittedAt: day(-2),
          }),
        ],
      }),
    );

    expect(result).toMatchObject({ status: 'calculated', amount: 150_000 });
  });

  it('skips content that has no link or is not delivered', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([], { id: 'a' }),
          delivered([link('instagram', { views: 50_000 })], {
            id: 'b',
            status: 'draft_approved',
          }),
        ],
      }),
    );

    expect(result.status).toBe('waiting_for_data');
  });

  it('waits for data while one link is still unmeasured, keeping the lines of the links that are (AC 5)', () => {
    const result = component.calculate(
      context({
        contents: [
          delivered([
            link('instagram', { views: 50_000 }),
            link('tiktok', { views: 9_000, likes: null }),
          ]),
        ],
      }),
    );

    expect(result.status).toBe('waiting_for_data');
    expect(result.amount).toBeNull();
    expect(result.lines.map((line) => line.basis.platform)).toEqual([
      'instagram',
    ]);
  });

  it('waits for a formula while none is saved', () => {
    const result = component.calculate(
      context({
        formula: null,
        contents: [delivered([link('instagram', { views: 50_000 })])],
      }),
    );

    expect(result.status).toBe('waiting_for_data');
  });
});
