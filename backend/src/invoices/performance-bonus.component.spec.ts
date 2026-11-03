import {
  content,
  context,
  day,
  FORMULA,
  link,
  SYNCED_AT,
} from './invoice-test-data.js';
import { PerformanceBonusComponent } from './performance-bonus.component.js';

const component = new PerformanceBonusComponent();

/** An Evergreen item handed in on time, with the given links. */
function delivered(overrides: Parameters<typeof content>[0] = {}) {
  return content({
    status: 'link_submitted',
    videoSubmittedAt: day(-1),
    deadline: day(0),
    ...overrides,
  });
}

describe('PerformanceBonusComponent', () => {
  describe('per link (AC 1, 2, 6)', () => {
    it('pays a link the highest tier its platform metric reaches, naming where the number came from', () => {
      // Arrange
      const measured = link({
        views: 41_200,
        source: 'synced',
        lastSyncedAt: SYNCED_AT,
      });

      // Act
      const result = component.calculate(
        context({ contents: [delivered({ links: [measured] })] }),
      );

      // Assert
      expect(result).toEqual({
        key: 'performanceBonus',
        amount: 400_000,
        status: 'calculated',
        lines: [
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
              lastSyncedAt: '2026-09-17T13:00:00.000Z',
            },
          },
        ],
      });
    });

    it('sums a cross-posted content, each link judged on its own platform metric and tiers', () => {
      // Arrange
      const crossPosted = delivered({
        links: [
          link({ platform: 'instagram', views: 41_200 }),
          link({ platform: 'tiktok', views: 99_999, likes: 1_000 }),
        ],
      });

      // Act
      const result = component.calculate(context({ contents: [crossPosted] }));

      // Assert
      expect(result.amount).toBe(450_000);
      expect(
        result.lines.map(({ amount, basis }) => [
          basis.platform,
          basis.metric,
          amount,
        ]),
      ).toEqual([
        ['instagram', 'views', 400_000],
        ['tiktok', 'likes', 50_000],
      ]);
    });

    it('reads comments and shares from the link, not only views and likes', () => {
      // Arrange
      const formula = {
        ...FORMULA,
        performanceBonus: {
          instagram: {
            metric: 'comments' as const,
            tiers: [{ threshold: 10, bonus: 50_000 }],
          },
          tiktok: {
            metric: 'shares' as const,
            tiers: [{ threshold: 5, bonus: 20_000 }],
          },
        },
      };
      const crossPosted = delivered({
        links: [
          link({ platform: 'instagram', comments: 12 }),
          link({ platform: 'tiktok', shares: 5 }),
        ],
      });

      // Act
      const result = component.calculate(
        context({ formula, contents: [crossPosted] }),
      );

      // Assert
      expect(result).toMatchObject({ status: 'calculated', amount: 70_000 });
    });

    it('pays a tier at exactly its minimum and nothing one below it', () => {
      // Arrange
      const contents = [
        delivered({ id: 'a', links: [link({ views: 10_000 })] }),
        delivered({ id: 'b', links: [link({ views: 9_999 })] }),
      ];

      // Act
      const result = component.calculate(context({ contents }));

      // Assert
      expect(
        result.lines.map((line) => [line.contentId, line.basis.tier]),
      ).toEqual([['a', 1]]);
      expect(result.amount).toBe(150_000);
    });

    it('is calculated at zero once every link is measured but none reaches a tier', () => {
      // Arrange
      const contents = [delivered({ links: [link({ views: 500 })] })];

      // Act
      const result = component.calculate(context({ contents }));

      // Assert
      expect(result).toEqual({
        key: 'performanceBonus',
        amount: 0,
        status: 'calculated',
        lines: [],
      });
    });

    it('names a manual entry as the source, with no sync time', () => {
      // Arrange
      const typedIn = link({ views: 12_000, source: 'manual' });

      // Act
      const result = component.calculate(
        context({ contents: [delivered({ links: [typedIn] })] }),
      );

      // Assert
      expect(result.lines[0].basis).toMatchObject({
        source: 'manual',
        lastSyncedAt: null,
      });
    });
  });

  describe('lateness, by the submitted date of PBI-38 (AC 3)', () => {
    it('gives a late Specific item no bonus, as it loses its fee', () => {
      // Arrange
      const lateSpecific = delivered({
        type: 'specific',
        deadline: day(-3),
        videoSubmittedAt: day(-1),
        links: [link({ views: 50_000 })],
      });

      // Act
      const result = component.calculate(context({ contents: [lateSpecific] }));

      // Assert
      expect(result).toMatchObject({
        status: 'calculated',
        amount: 0,
        lines: [],
      });
    });

    it('pays a Specific item handed in on its deadline day', () => {
      // Arrange
      const onTime = delivered({
        type: 'specific',
        deadline: day(-3),
        videoSubmittedAt: day(-3),
        links: [link({ views: 12_000 })],
      });

      // Act
      const result = component.calculate(context({ contents: [onTime] }));

      // Assert
      expect(result.amount).toBe(150_000);
    });

    it('still pays a late Evergreen item its bonus', () => {
      // Arrange
      const lateEvergreen = delivered({
        deadline: day(-10),
        videoSubmittedAt: day(-2),
        links: [link({ views: 12_000 })],
      });

      // Act
      const result = component.calculate(
        context({ contents: [lateEvergreen] }),
      );

      // Assert
      expect(result).toMatchObject({ status: 'calculated', amount: 150_000 });
    });
  });

  describe('a platform without tiers (AC 4)', () => {
    it('pays nothing for it and never waits on its numbers', () => {
      // Arrange
      const formula = {
        ...FORMULA,
        performanceBonus: { instagram: FORMULA.performanceBonus.instagram },
      };
      const contents = [
        delivered({ links: [link({ platform: 'tiktok', likes: null })] }),
      ];

      // Act
      const result = component.calculate(context({ formula, contents }));

      // Assert
      expect(result).toEqual({
        key: 'performanceBonus',
        amount: 0,
        status: 'calculated',
        lines: [],
      });
    });

    it('treats an empty tier list the same as no tiers', () => {
      // Arrange
      const formula = {
        ...FORMULA,
        performanceBonus: {
          instagram: { metric: 'views' as const, tiers: [] },
        },
      };
      const contents = [delivered({ links: [link({ views: 90_000 })] })];

      // Act
      const result = component.calculate(context({ formula, contents }));

      // Assert
      expect(result).toMatchObject({
        status: 'calculated',
        amount: 0,
        lines: [],
      });
    });
  });

  describe('a link with no number (AC 5)', () => {
    it('shows the waiting link while the measured link keeps its bonus', () => {
      // Arrange
      const crossPosted = delivered({
        links: [
          link({ platform: 'instagram', views: 50_000, source: 'synced', lastSyncedAt: SYNCED_AT }),
          link({ platform: 'tiktok', likes: null, views: 3_000 }),
        ],
      });

      // Act
      const result = component.calculate(context({ contents: [crossPosted] }));

      // Assert
      expect(result.status).toBe('waiting_for_data');
      expect(result.amount).toBeNull();
      expect(result.lines).toEqual([
        {
          contentId: 'content-1',
          contentName: 'Evg_1_RanggaPratama',
          amount: 400_000,
          basis: {
            platform: 'instagram',
            metric: 'views',
            value: 50_000,
            tier: 2,
            source: 'synced',
            lastSyncedAt: '2026-09-17T13:00:00.000Z',
          },
        },
        {
          contentId: 'content-1',
          contentName: 'Evg_1_RanggaPratama',
          amount: 0,
          basis: {
            platform: 'tiktok',
            metric: 'likes',
            status: 'waiting',
            source: null,
            lastSyncedAt: null,
          },
        },
      ]);
    });

    it('counts a measured 0 as a number, not as waiting', () => {
      // Arrange
      const contents = [delivered({ links: [link({ views: 0 })] })];

      // Act
      const result = component.calculate(context({ contents }));

      // Assert
      expect(result).toMatchObject({ status: 'calculated', amount: 0 });
    });
  });

  describe('nothing to judge yet', () => {
    it('waits for data while nothing has been delivered with a link', () => {
      // Arrange
      const contents = [
        delivered({ id: 'no-link', links: [] }),
        delivered({
          id: 'not-delivered',
          status: 'draft_approved',
          links: [link({ views: 50_000 })],
        }),
      ];

      // Act
      const result = component.calculate(context({ contents }));

      // Assert
      expect(result).toEqual({
        key: 'performanceBonus',
        amount: null,
        status: 'waiting_for_data',
        lines: [],
      });
    });

    it('waits for a formula while none is saved', () => {
      // Arrange
      const contents = [delivered({ links: [link({ views: 50_000 })] })];

      // Act
      const result = component.calculate(context({ formula: null, contents }));

      // Assert
      expect(result).toMatchObject({
        status: 'waiting_for_data',
        amount: null,
      });
    });
  });
});
