import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  PrismaSocialAccountLinker,
  type SocialAccountRows,
} from './prisma-social-account-linker.js';
import type { PlatformAccount } from './ports.js';
import { TokenCipher } from './token-cipher.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const OTHER_CREATOR = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const NOW = new Date('2026-10-29T03:00:00.000Z');

const ACCOUNT: PlatformAccount = {
  platform: 'tiktok',
  platformUserId: 'open-id-1',
  username: 'rangga.creates',
  accessToken: 'act.secret-access',
  accessTokenExpiresAt: new Date('2026-10-30T03:00:00.000Z'),
  refreshToken: 'rft.secret-refresh',
  refreshTokenExpiresAt: new Date('2027-10-29T03:00:00.000Z'),
};

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`platform`,`platform_user_id`)',
    { code: 'P2002', clientVersion: '6.19.3' },
  );
}

describe('PrismaSocialAccountLinker', () => {
  const cipher = new TokenCipher(randomBytes(32).toString('base64'));
  let rows: {
    social_accounts: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
  let linker: PrismaSocialAccountLinker;

  beforeEach(() => {
    rows = {
      social_accounts: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    linker = new PrismaSocialAccountLinker(
      rows as unknown as SocialAccountRows,
      cipher,
      () => NOW,
    );
  });

  /** What the one upsert wrote, so the stored values can be checked. */
  function written(): {
    where: unknown;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  } {
    return rows.social_accounts.upsert.mock.calls[0][0];
  }

  describe('an account nobody holds yet', () => {
    it('is connected to the creator', async () => {
      await expect(linker.link(CREATOR, ACCOUNT)).resolves.toBe('linked');
    });

    it('looks the platform account up by its platform id', async () => {
      await linker.link(CREATOR, ACCOUNT);

      expect(rows.social_accounts.findUnique).toHaveBeenCalledWith({
        where: {
          platform_platform_user_id: {
            platform: 'tiktok',
            platform_user_id: 'open-id-1',
          },
        },
        select: { creator_id: true },
      });
    });

    // PRD 19: one account per platform per creator, and a reconnect replaces the old token.
    it("replaces the creator's row for the platform, or makes it", async () => {
      await linker.link(CREATOR, ACCOUNT);

      const { where, create, update } = written();
      expect(where).toEqual({
        creator_id_platform: { creator_id: CREATOR, platform: 'tiktok' },
      });
      expect(create).toMatchObject({ creator_id: CREATOR, platform: 'tiktok' });
      const { creator_id: _c, platform: _p, ...createdValues } = create;
      expect(createdValues).toEqual(update);
    });

    it('keeps the platform id, the platform username and when it connected', async () => {
      await linker.link(CREATOR, ACCOUNT);

      expect(written().update).toMatchObject({
        platform_user_id: 'open-id-1',
        username: 'rangga.creates',
        is_connected: true,
        connected_at: NOW,
        token_expires_at: ACCOUNT.accessTokenExpiresAt,
        refresh_token_expires_at: ACCOUNT.refreshTokenExpiresAt,
      });
    });

    // OWASP A04:2025 (Cryptographic Failures): tokens at rest are encrypted, and each opens only
    // for this creator and platform.
    it('stores both tokens encrypted for this creator and platform', async () => {
      await linker.link(CREATOR, ACCOUNT);

      const { access_token, refresh_token } = written().update as {
        access_token: string;
        refresh_token: string;
      };
      expect(access_token).not.toContain(ACCOUNT.accessToken);
      expect(refresh_token).not.toContain(ACCOUNT.refreshToken);
      expect(cipher.decrypt(access_token, `${CREATOR}:tiktok`)).toBe(
        ACCOUNT.accessToken,
      );
      expect(cipher.decrypt(refresh_token, `${CREATOR}:tiktok`)).toBe(
        ACCOUNT.refreshToken,
      );
    });

    it('stores no refresh token when the platform gives none', async () => {
      await linker.link(CREATOR, {
        ...ACCOUNT,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      });

      expect(written().update).toMatchObject({
        refresh_token: null,
        refresh_token_expires_at: null,
      });
    });
  });

  it('reconnects the account the creator already holds', async () => {
    rows.social_accounts.findUnique.mockResolvedValue({ creator_id: CREATOR });

    await expect(linker.link(CREATOR, ACCOUNT)).resolves.toBe('linked');
    expect(rows.social_accounts.upsert).toHaveBeenCalledTimes(1);
  });

  // PRD 19: "Akun ini sudah terhubung ke creator lain."
  describe('an account another creator holds', () => {
    it('is refused without touching any row', async () => {
      rows.social_accounts.findUnique.mockResolvedValue({
        creator_id: OTHER_CREATOR,
      });

      await expect(linker.link(CREATOR, ACCOUNT)).resolves.toBe('taken');
      expect(rows.social_accounts.upsert).not.toHaveBeenCalled();
    });

    // Two creators finishing the same account at once both see it free; the unique key on
    // (platform, platform_user_id) lets only one write land.
    it('is refused when another creator connected it a moment earlier', async () => {
      rows.social_accounts.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ creator_id: OTHER_CREATOR });
      rows.social_accounts.upsert.mockRejectedValue(uniqueViolation());

      await expect(linker.link(CREATOR, ACCOUNT)).resolves.toBe('taken');
    });
  });

  it('passes on a unique violation the account holder does not explain', async () => {
    const violation = uniqueViolation();
    rows.social_accounts.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ creator_id: CREATOR });
    rows.social_accounts.upsert.mockRejectedValue(violation);

    await expect(linker.link(CREATOR, ACCOUNT)).rejects.toBe(violation);
  });

  it('passes on any other storage failure', async () => {
    const failure = new Error('connection lost');
    rows.social_accounts.upsert.mockRejectedValue(failure);

    await expect(linker.link(CREATOR, ACCOUNT)).rejects.toBe(failure);
  });

  it('reads the real clock when none is given', async () => {
    const before = Date.now();
    await new PrismaSocialAccountLinker(
      rows as unknown as SocialAccountRows,
      cipher,
    ).link(CREATOR, ACCOUNT);

    expect(
      (written().update.connected_at as Date).getTime(),
    ).toBeGreaterThanOrEqual(before);
  });
});
