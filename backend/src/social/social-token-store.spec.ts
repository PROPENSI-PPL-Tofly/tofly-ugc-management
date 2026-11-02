import { randomBytes } from 'node:crypto';
import {
  PrismaSocialTokenStore,
  type SocialTokenRows,
} from './social-token-store.js';
import { TokenCipher } from './token-cipher.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const OTHER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const ACCESS = 'act.access-token-value';
const REFRESH = 'rft.refresh-token-value';
const ACCESS_UNTIL = new Date('2026-11-02T03:00:00.000Z');
const REFRESH_UNTIL = new Date('2027-10-30T03:00:00.000Z');

const cipher = new TokenCipher(randomBytes(32).toString('base64'));

/** A connected TikTok row, its tokens sealed for `owner` as the linker seals them (19.2). */
function row(owner = CREATOR, overrides: Record<string, unknown> = {}) {
  return {
    access_token: cipher.encrypt(ACCESS, `${owner}:tiktok`),
    token_expires_at: ACCESS_UNTIL,
    refresh_token: cipher.encrypt(REFRESH, `${owner}:tiktok`),
    refresh_token_expires_at: REFRESH_UNTIL,
    platform_user_id: 'open-id-123',
    ...overrides,
  };
}

function stubRows() {
  return {
    social_accounts: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
}

function storeWith(rows: ReturnType<typeof stubRows>) {
  return new PrismaSocialTokenStore(rows as unknown as SocialTokenRows, cipher);
}

describe('PrismaSocialTokenStore', () => {
  let rows: ReturnType<typeof stubRows>;
  let store: PrismaSocialTokenStore;

  beforeEach(() => {
    rows = stubRows();
    store = storeWith(rows);
  });

  describe('load', () => {
    it('opens the tokens of a connected account, with their expiry', async () => {
      const stored = row();
      rows.social_accounts.findUnique.mockResolvedValue(stored);

      const tokens = await store.load(CREATOR, 'tiktok');

      expect(tokens).toEqual({
        handle: stored.access_token,
        accessToken: ACCESS,
        accessTokenExpiresAt: ACCESS_UNTIL,
        refreshToken: REFRESH,
        refreshTokenExpiresAt: REFRESH_UNTIL,
      });
    });

    it("reads only that creator's row for the platform, and only the token columns", async () => {
      rows.social_accounts.findUnique.mockResolvedValue(row());

      await store.load(CREATOR, 'tiktok');

      expect(rows.social_accounts.findUnique).toHaveBeenCalledWith({
        where: {
          creator_id_platform: { creator_id: CREATOR, platform: 'tiktok' },
        },
        select: {
          access_token: true,
          token_expires_at: true,
          refresh_token: true,
          refresh_token_expires_at: true,
          platform_user_id: true,
        },
      });
    });

    // Instagram's long-lived token is refreshed with itself, so it has no refresh token.
    it('opens an account without a refresh token', async () => {
      rows.social_accounts.findUnique.mockResolvedValue(
        row(CREATOR, { refresh_token: null, refresh_token_expires_at: null }),
      );

      await expect(store.load(CREATOR, 'tiktok')).resolves.toMatchObject({
        refreshToken: null,
        refreshTokenExpiresAt: null,
      });
    });

    it.each([
      ['no row', null],
      [
        'an account typed at Tambah Creator but never connected',
        row(CREATOR, { platform_user_id: null }),
      ],
      [
        'a connected account without an access token',
        row(CREATOR, { access_token: null }),
      ],
    ])('reads %s as not connected', async (_, stored) => {
      rows.social_accounts.findUnique.mockResolvedValue(stored);

      await expect(store.load(CREATOR, 'tiktok')).resolves.toBeNull();
    });

    // OWASP A04:2025: a token sealed for another creator does not open here, so a copied row
    // cannot read someone else's videos.
    it.each([
      [
        'an access token sealed for another creator',
        row(CREATOR, { access_token: row(OTHER).access_token }),
      ],
      [
        'a refresh token sealed for another creator',
        row(CREATOR, { refresh_token: row(OTHER).refresh_token }),
      ],
      ['a token that is not sealed', row(CREATOR, { access_token: ACCESS })],
    ])('reads %s as not connected, without throwing', async (_, stored) => {
      rows.social_accounts.findUnique.mockResolvedValue(stored);

      await expect(store.load(CREATOR, 'tiktok')).resolves.toBeNull();
    });
  });

  describe('replace', () => {
    const REFRESHED = {
      accessToken: 'act.new-access',
      accessTokenExpiresAt: new Date('2026-11-03T02:00:00.000Z'),
      refreshToken: 'rft.new-refresh',
      refreshTokenExpiresAt: new Date('2027-11-02T02:00:00.000Z'),
    };

    it('stores the refreshed tokens sealed for the creator and platform', async () => {
      rows.social_accounts.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        store.replace(CREATOR, 'tiktok', 'v1.old', REFRESHED),
      ).resolves.toBe(true);

      const [{ where, data }] = rows.social_accounts.updateMany.mock.calls[0];
      expect(where).toEqual({
        creator_id: CREATOR,
        platform: 'tiktok',
        access_token: 'v1.old',
      });
      expect(cipher.decrypt(data.access_token, `${CREATOR}:tiktok`)).toBe(
        'act.new-access',
      );
      expect(cipher.decrypt(data.refresh_token, `${CREATOR}:tiktok`)).toBe(
        'rft.new-refresh',
      );
      expect(data).toMatchObject({
        token_expires_at: REFRESHED.accessTokenExpiresAt,
        refresh_token_expires_at: REFRESHED.refreshTokenExpiresAt,
      });
    });

    // OWASP A04:2025: the plain tokens never reach the database.
    it('never writes a token in the clear', async () => {
      rows.social_accounts.updateMany.mockResolvedValue({ count: 1 });

      await store.replace(CREATOR, 'tiktok', 'v1.old', REFRESHED);

      const written = JSON.stringify(
        rows.social_accounts.updateMany.mock.calls[0],
      );
      expect(written).not.toContain('act.new-access');
      expect(written).not.toContain('rft.new-refresh');
    });

    it('stores no refresh token when the platform gave none', async () => {
      rows.social_accounts.updateMany.mockResolvedValue({ count: 1 });

      await store.replace(CREATOR, 'tiktok', 'v1.old', {
        ...REFRESHED,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      });

      expect(
        rows.social_accounts.updateMany.mock.calls[0][0].data,
      ).toMatchObject({
        refresh_token: null,
        refresh_token_expires_at: null,
      });
    });

    // The creator reconnected (or disconnected) while the sync refreshed: the newer connection
    // wins and the sync's tokens are dropped.
    it('leaves a connection made since the tokens were read', async () => {
      rows.social_accounts.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        store.replace(CREATOR, 'tiktok', 'v1.old', REFRESHED),
      ).resolves.toBe(false);
    });
  });

  describe('disconnect', () => {
    // PRD 27 "Ketahanan": a failed refresh leaves the account "Belum terhubung" (badge PBI-19).
    it('deletes the tokens and marks the account not connected, keeping the username', async () => {
      rows.social_accounts.updateMany.mockResolvedValue({ count: 1 });

      await expect(store.disconnect(CREATOR, 'tiktok', 'v1.old')).resolves.toBe(
        true,
      );

      expect(rows.social_accounts.updateMany).toHaveBeenCalledWith({
        where: {
          creator_id: CREATOR,
          platform: 'tiktok',
          access_token: 'v1.old',
        },
        data: {
          access_token: null,
          token_expires_at: null,
          refresh_token: null,
          refresh_token_expires_at: null,
          is_connected: false,
          platform_user_id: null,
          connected_at: null,
        },
      });
    });

    it('leaves a connection made since the tokens were read', async () => {
      rows.social_accounts.updateMany.mockResolvedValue({ count: 0 });

      await expect(store.disconnect(CREATOR, 'tiktok', 'v1.old')).resolves.toBe(
        false,
      );
    });
  });
});
