import {
  CONNECTION_COLUMNS,
  connectionOf,
  withLastSync,
} from './social-connection.js';

const CONNECTED_AT = new Date('2026-10-29T03:00:00.000Z');

describe('connectionOf', () => {
  it('reads a connected row with its date, not synced yet', () => {
    expect(
      connectionOf({
        is_connected: true,
        platform_user_id: 'open-id-1',
        connected_at: CONNECTED_AT,
      }),
    ).toEqual({
      connected: true,
      connectedAt: '2026-10-29T03:00:00.000Z',
      lastSyncAt: null,
    });
  });

  // Rows from before PBI-19 (and the seed) carry the flag with no platform account behind it.
  it('does not count a flag with no platform account behind it', () => {
    expect(
      connectionOf({
        is_connected: true,
        platform_user_id: null,
        connected_at: null,
      }),
    ).toEqual({ connected: false, connectedAt: null, lastSyncAt: null });
  });

  it('does not count an account whose flag has gone off, and hides its date', () => {
    expect(
      connectionOf({
        is_connected: false,
        platform_user_id: 'open-id-1',
        connected_at: CONNECTED_AT,
      }),
    ).toEqual({ connected: false, connectedAt: null, lastSyncAt: null });
  });

  it('reads a connected row with no date as no date', () => {
    expect(
      connectionOf({
        is_connected: true,
        platform_user_id: 'open-id-1',
        connected_at: null,
      }).connectedAt,
    ).toBeNull();
  });

  describe('withLastSync', () => {
    const SYNCED_AT = new Date('2026-11-02T19:00:00.000Z');
    const CONNECTED = {
      connected: true,
      connectedAt: '2026-10-29T03:00:00.000Z',
      lastSyncAt: null,
    };

    it('adds the time of the last sync to a connected account', () => {
      expect(withLastSync(CONNECTED, SYNCED_AT)).toEqual({
        ...CONNECTED,
        lastSyncAt: '2026-11-02T19:00:00.000Z',
      });
    });

    it('leaves an account that has never synced as it is', () => {
      expect(withLastSync(CONNECTED, undefined)).toEqual(CONNECTED);
    });

    it('shows no sync on an account that is not connected', () => {
      const disconnected = {
        connected: false,
        connectedAt: null,
        lastSyncAt: null,
      };

      expect(withLastSync(disconnected, SYNCED_AT)).toEqual(disconnected);
    });
  });

  // OWASP A01:2025: what a response is built from never holds a token.
  it('selects no token column', () => {
    expect(Object.keys(CONNECTION_COLUMNS).toSorted()).toEqual([
      'connected_at',
      'is_connected',
      'platform_user_id',
    ]);
  });
});
