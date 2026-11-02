import {
  EnterManualPerformance,
  type PerformanceTarget,
} from './enter-manual-performance.js';

const NOW = new Date('2026-11-04T03:15:00.000Z');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const SYNCED_AT = new Date('2026-11-03T19:00:00.000Z');

/** A delivered content's TikTok link on an unconnected account, read under the contract lock. */
function target(overrides: Partial<PerformanceTarget> = {}): PerformanceTarget {
  return {
    contentId: 'content-1',
    invoiceStatus: 'running',
    connection: undefined,
    link: {
      id: 'link-1',
      platform: 'tiktok',
      url: 'https://www.tiktok.com/@nabila/video/7412345678901234567',
      data_state: 'sync_failed',
      views: 9000,
      likes: null,
      comments: 0,
      shares: 3,
      last_synced_at: SYNCED_AT,
    },
    ...overrides,
  };
}

const ENTERED = { views: 12400, likes: 500, comments: 0, shares: null };

describe('EnterManualPerformance', () => {
  const plan = () =>
    new EnterManualPerformance('tiktok', ENTERED).plan(target(), ADMIN, NOW);

  it('writes the four numbers as typed, a 0 and an empty one included, as manual with the admin and the time', () => {
    expect(plan().data).toEqual({
      views: 12400,
      likes: 500,
      comments: 0,
      shares: null,
      data_state: 'manual',
      manual_by: ADMIN,
      manual_at: NOW,
    });
  });

  it('leaves the last sync time alone: the numbers did not come from a sync', () => {
    expect(plan().data).not.toHaveProperty('last_synced_at');
  });

  it('writes only on the link as it was read: its id, its state and its video', () => {
    expect(plan().guard).toEqual({
      id: 'link-1',
      data_state: 'sync_failed',
      url: 'https://www.tiktok.com/@nabila/video/7412345678901234567',
    });
  });

  it('records Performance Entered by the admin with the platform and the old and new numbers', () => {
    expect(plan().event).toEqual({
      content_id: 'content-1',
      event_type: 'Performance Entered',
      actor_name: 'Admin',
      actor_role: 'admin',
      actor_user_id: ADMIN,
      occurred_at: NOW,
      event_data: {
        platform: 'tiktok',
        previous: { views: 9000, likes: null, comments: 0, shares: 3 },
        entered: { views: 12400, likes: 500, comments: 0, shares: null },
      },
    });
  });

  it("answers the link's performance as the card reads it, never the admin", () => {
    expect(plan().result).toEqual({
      views: 12400,
      likes: 500,
      comments: 0,
      shares: null,
      state: 'manual',
      lastSyncedAt: SYNCED_AT.toISOString(),
      manualAt: NOW.toISOString(),
    });
  });
});
