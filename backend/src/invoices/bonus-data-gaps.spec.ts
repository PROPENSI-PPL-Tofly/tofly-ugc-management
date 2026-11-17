import { bonusDataGaps, frozenWithoutData } from './bonus-data-gaps.js';
import {
  calculated,
  waitingForData,
  type InvoiceLine,
} from './invoice-component.js';

// What Finalize tells the admin about the links still waiting for data (AC 9), read off 28.1's
// per-link bonus lines, and the Rp0 line each of them is frozen as when the admin freezes anyway.

const measured: InvoiceLine = {
  contentId: 'content-1',
  contentName: 'Evg_1',
  amount: 150_000,
  basis: {
    platform: 'instagram',
    metric: 'views',
    value: 12_000,
    tier: 1,
    source: 'synced',
    lastSyncedAt: '2026-10-30T19:00:00.000Z',
    manualAt: null,
  },
};

const waiting: InvoiceLine = {
  contentId: 'content-2',
  contentName: 'Spc_1',
  amount: 0,
  basis: {
    platform: 'tiktok',
    metric: 'likes',
    status: 'waiting',
    state: 'sync_failed',
    source: null,
    lastSyncedAt: null,
    manualAt: null,
  },
};

describe('bonusDataGaps', () => {
  it('lists each waiting link with its content, platform, metric and state, and the line it freezes as', () => {
    // Act
    const gaps = bonusDataGaps(
      waitingForData('performanceBonus', [measured, waiting]),
    );

    // Assert
    expect(gaps).toEqual({
      available: true,
      waiting: [
        {
          contentId: 'content-2',
          contentName: 'Spc_1',
          platform: 'tiktok',
          metric: 'likes',
          state: 'sync_failed',
        },
      ],
      noDataLines: [frozenWithoutData(waiting)],
    });
  });

  // An empty list is an answer here, not a missing one: every link has its number.
  it('answers an empty list once every judged link is measured', () => {
    expect(
      bonusDataGaps(calculated('performanceBonus', [measured])),
    ).toEqual({ available: true, waiting: [], noDataLines: [] });
  });
});

describe('frozenWithoutData', () => {
  it('turns a waiting line into the Rp0 no_data line a frozen invoice keeps, state and trace included', () => {
    expect(frozenWithoutData(waiting)).toEqual({
      contentId: 'content-2',
      contentName: 'Spc_1',
      amount: 0,
      basis: {
        platform: 'tiktok',
        metric: 'likes',
        status: 'no_data',
        state: 'sync_failed',
        source: null,
        lastSyncedAt: null,
        manualAt: null,
      },
    });
  });

  it('leaves a measured line as it is', () => {
    expect(frozenWithoutData(measured)).toBe(measured);
  });
});
