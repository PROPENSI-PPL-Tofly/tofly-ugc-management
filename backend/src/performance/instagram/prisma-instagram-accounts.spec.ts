import { randomBytes } from 'node:crypto';
import { TokenCipher } from '../../social/token-cipher.js';
import {
  PrismaInstagramAccounts,
  type InstagramAccountRows,
} from './prisma-instagram-accounts.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const IG_ID = '17841400000000000';
const TOKEN = 'IGAA-long-lived-token';
const EXPIRES_AT = new Date(Date.UTC(2026, 11, 28, 10, 0, 0));

const cipher = new TokenCipher(randomBytes(32).toString('base64'));
// The context PrismaSocialAccountLinker seals Instagram's token with.
const CONTEXT = `${CREATOR}:instagram`;

function rowsWith(row: Record<string, unknown> | null) {
  const findUnique = vi.fn().mockResolvedValue(row);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  return {
    rows: { social_accounts: { findUnique, updateMany } },
    findUnique,
    updateMany,
  };
}

function accountsOver(fake: ReturnType<typeof rowsWith>) {
  return new PrismaInstagramAccounts(
    fake.rows as unknown as InstagramAccountRows,
    cipher,
  );
}

const CONNECTED = {
  is_connected: true,
  platform_user_id: IG_ID,
  access_token: cipher.encrypt(TOKEN, CONTEXT),
  token_expires_at: EXPIRES_AT,
};

describe('PrismaInstagramAccounts', () => {
  describe('find', () => {
    it("opens the connected Instagram account's token", async () => {
      const fake = rowsWith(CONNECTED);

      await expect(accountsOver(fake).find(CREATOR)).resolves.toEqual({
        platformUserId: IG_ID,
        accessToken: TOKEN,
        expiresAt: EXPIRES_AT,
      });
    });

    // The refresh token is TikTok's; Instagram's adapter never needs it, so it is never read.
    it("asks only for this creator's Instagram row, without the refresh token", async () => {
      const fake = rowsWith(CONNECTED);

      await accountsOver(fake).find(CREATOR);

      expect(fake.findUnique).toHaveBeenCalledWith({
        where: {
          creator_id_platform: { creator_id: CREATOR, platform: 'instagram' },
        },
        select: {
          is_connected: true,
          platform_user_id: true,
          access_token: true,
          token_expires_at: true,
        },
      });
    });

    it('keeps an account with no expiry on record as having none', async () => {
      const fake = rowsWith({ ...CONNECTED, token_expires_at: null });

      await expect(accountsOver(fake).find(CREATOR)).resolves.toMatchObject({
        expiresAt: null,
      });
    });

    it.each<[string, Record<string, unknown> | null]>([
      ['no Instagram row', null],
      ['a row that is not connected', { ...CONNECTED, is_connected: false }],
      // Typed at Tambah Creator, or from before PBI-19: the flag with no account behind it.
      [
        'a row with no platform account',
        { ...CONNECTED, platform_user_id: null },
      ],
      ['a row with no token', { ...CONNECTED, access_token: null }],
      // Sealed under another creator's context, or with another key.
      [
        'a token that does not open',
        {
          ...CONNECTED,
          access_token: cipher.encrypt(TOKEN, 'other:instagram'),
        },
      ],
    ])('finds no account to read with on %s', async (_what, row) => {
      await expect(
        accountsOver(rowsWith(row)).find(CREATOR),
      ).resolves.toBeNull();
    });
  });

  describe('saveToken', () => {
    it('keeps the refreshed token sealed, with its new expiry', async () => {
      const fake = rowsWith(CONNECTED);

      await accountsOver(fake).saveToken(CREATOR, 'IGAA-new', EXPIRES_AT);

      const [{ where, data }] = fake.updateMany.mock.calls[0] as [
        {
          where: unknown;
          data: { access_token: string; token_expires_at: Date };
        },
      ];
      // A creator who pressed Putuskan meanwhile does not get a token back.
      expect(where).toEqual({
        creator_id: CREATOR,
        platform: 'instagram',
        is_connected: true,
      });
      expect(data.token_expires_at).toEqual(EXPIRES_AT);
      expect(data.access_token).not.toContain('IGAA-new');
      expect(cipher.decrypt(data.access_token, CONTEXT)).toBe('IGAA-new');
    });
  });

  describe('disconnect', () => {
    // AC 7: the PBI-19 badge reads "Belum terhubung". The platform account and the username stay,
    // so reconnecting finds the same row (review note on #136).
    it('marks the account not connected and drops its dead token', async () => {
      const fake = rowsWith(CONNECTED);

      await accountsOver(fake).disconnect(CREATOR);

      expect(fake.updateMany).toHaveBeenCalledWith({
        where: { creator_id: CREATOR, platform: 'instagram' },
        data: {
          is_connected: false,
          access_token: null,
          token_expires_at: null,
        },
      });
    });
  });
});
