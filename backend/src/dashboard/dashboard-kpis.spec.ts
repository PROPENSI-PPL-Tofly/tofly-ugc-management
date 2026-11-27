import { computeKpis, KPI_INPUTS } from './dashboard-kpis.js';

const BASE = {
  spending: 12_000_000,
  unpaid: 3_000_000,
  views: 40_000,
  engagement: 4_000,
  due: 20,
  onTime: 16,
};

describe("the executive dashboard's six KPIs", () => {
  it('names and orders all six cards, each with a formula', () => {
    const kpis = computeKpis(BASE, BASE);

    expect(kpis.map((card) => card.key)).toEqual(KPI_INPUTS);
    for (const card of kpis) {
      expect(card.formula).toBeTruthy();
      expect(card.label).toBeTruthy();
    }
  });

  it('reads the values from the range and the previous one', () => {
    const kpis = computeKpis(BASE, {
      spending: 10_000_000,
      unpaid: 5_000_000,
      views: 50_000,
      engagement: 2_000,
      due: 10,
      onTime: 10,
    });
    const byKey = Object.fromEntries(kpis.map((card) => [card.key, card]));

    expect(byKey.totalSpending.value).toBe(12_000_000);
    expect(byKey.unpaid.value).toBe(3_000_000);
    expect(byKey.totalViews.value).toBe(40_000);
    expect(byKey.costPer1000Views.value).toBe(300_000);
    expect(byKey.onTimeRate.value).toBe(80);
    expect(byKey.engagementRate.value).toBe(10);
  });

  // A cost going up and a view count going up are opposite news for the same relative move.
  it('marks a rise as good for views and bad for costs, and a fall the other way', () => {
    const up = computeKpis(
      { ...BASE, spending: 11, views: 11 },
      { ...BASE, spending: 10, views: 10 },
    );
    const down = computeKpis(
      { ...BASE, spending: 9, views: 9 },
      { ...BASE, spending: 10, views: 10 },
    );
    const pick = (cards: typeof up, key: string) => cards.find((c) => c.key === key)!;

    expect(pick(up, 'totalViews')).toMatchObject({ direction: 'up', good: true });
    expect(pick(up, 'totalSpending')).toMatchObject({ direction: 'up', good: false });
    expect(pick(down, 'totalViews')).toMatchObject({ direction: 'down', good: false });
    expect(pick(down, 'totalSpending')).toMatchObject({ direction: 'down', good: true });
  });

  it('reports the change as a ratio against the previous range', () => {
    const card = computeKpis({ ...BASE, views: 44_000 }, BASE).find(
      (c) => c.key === 'totalViews',
    )!;
    expect(card.change).toBeCloseTo(0.1);
  });

  it('has no change to report when the previous range was empty', () => {
    const cards = computeKpis(BASE, {
      spending: 0,
      unpaid: 0,
      views: 0,
      engagement: 0,
      due: 0,
      onTime: 0,
    });
    for (const card of cards) {
      expect(card.change).toBeNull();
    }
  });

  it('shows "—" instead of dividing by zero', () => {
    const cards = computeKpis(
      { spending: 1_000, unpaid: 0, views: 0, engagement: 0, due: 0, onTime: 0 },
      BASE,
    );
    const byKey = Object.fromEntries(cards.map((card) => [card.key, card]));
    expect(byKey.costPer1000Views.value).toBeNull();
    expect(byKey.engagementRate.value).toBeNull();
    expect(byKey.onTimeRate.value).toBeNull();
  });

  it('reads an unchanged value as flat', () => {
    for (const card of computeKpis(BASE, BASE)) {
      expect(card.direction).toBe('flat');
      expect(card.change).toBe(0);
    }
  });
});
