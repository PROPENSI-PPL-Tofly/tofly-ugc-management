import {
  toLinkPerformance,
  type StoredLinkPerformance,
} from './link-performance.mapper.js';

const SYNCED_AT = new Date('2026-11-03T19:00:00.000Z');
const MANUAL_AT = new Date('2026-11-04T03:15:00.000Z');

function stored(
  overrides: Partial<StoredLinkPerformance> = {},
): StoredLinkPerformance {
  return {
    platform: 'instagram',
    views: 12400,
    likes: 0,
    comments: null,
    shares: 41,
    data_state: 'synced',
    last_synced_at: SYNCED_AT,
    manual_at: null,
    ...overrides,
  };
}

const CONNECTED = { is_connected: true, platform_user_id: '17841' };

describe('toLinkPerformance', () => {
  it('sends the four numbers as stored, a 0 as 0 and no data as null, with the times as ISO instants', () => {
    expect(
      toLinkPerformance(stored({ manual_at: MANUAL_AT }), CONNECTED),
    ).toStrictEqual({
      views: 12400,
      likes: 0,
      comments: null,
      shares: 41,
      state: 'synced',
      lastSyncedAt: SYNCED_AT.toISOString(),
      manualAt: MANUAL_AT.toISOString(),
    });
  });

  it('sends the effective state: a waiting link reads not_connected until the creator connects that platform', () => {
    const waiting = stored({ data_state: 'waiting', last_synced_at: null });

    expect(toLinkPerformance(waiting, undefined)?.state).toBe('not_connected');
    expect(
      toLinkPerformance(waiting, { is_connected: true, platform_user_id: null })
        ?.state,
    ).toBe('not_connected');
    expect(toLinkPerformance(waiting, CONNECTED)?.state).toBe('waiting');
  });

  it('never sends who typed numbers in, whatever else the row carries', () => {
    const row = {
      ...stored(),
      manual_by: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f',
    };

    expect(toLinkPerformance(row, CONNECTED)).not.toHaveProperty('manual_by');
    expect(toLinkPerformance(row, CONNECTED)).not.toHaveProperty('manualBy');
  });

  it('sends null for a link kept from before platforms were recorded: there is nothing to measure it on', () => {
    expect(toLinkPerformance(stored({ platform: null }), CONNECTED)).toBeNull();
  });
});
