import { isConnected } from './account-connections.js';

describe('isConnected (PBI-19 19.3)', () => {
  it('counts an account connected only with the flag and a platform account behind it', () => {
    expect(isConnected({ is_connected: true, platform_user_id: '7012' })).toBe(
      true,
    );
  });

  it('does not count a flag with no platform account, as rows from before PBI-19 can carry', () => {
    expect(isConnected({ is_connected: true, platform_user_id: null })).toBe(
      false,
    );
  });

  it('does not count a platform account whose flag is off, as after a disconnect', () => {
    expect(isConnected({ is_connected: false, platform_user_id: '7012' })).toBe(
      false,
    );
  });

  it('does not count an account the creator does not have on file', () => {
    expect(isConnected(undefined)).toBe(false);
  });
});
