import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { CreatorsService } from '../src/creators/creators.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MySocialAccountsService } from '../src/social/my-social-accounts.service.js';
import type { PlatformAccount } from '../src/social/ports.js';
import { PrismaSocialAccountLinker } from '../src/social/prisma-social-account-linker.js';
import { TokenCipher } from '../src/social/token-cipher.js';

const MARKER = 'e2e-social-storage';
const OPEN_ID = `${MARKER}-open-id`;
const ACCESS = 'act.e2e-access-token';
const REFRESH = 'rft.e2e-refresh-token';

function tiktokAccount(platformUserId = OPEN_ID): PlatformAccount {
  return {
    platform: 'tiktok',
    platformUserId,
    username: 'rangga.creates',
    accessToken: ACCESS,
    accessTokenExpiresAt: new Date(Date.now() + 86_400_000),
    refreshToken: REFRESH,
    refreshTokenExpiresAt: new Date(Date.now() + 31_536_000_000),
  };
}

/**
 * social_accounts against the real database (PBI-19, review #127). The linker's unit tests stub
 * Prisma, so they prove only how it reads a P2002; these prove the unique index on
 * (platform, platform_user_id) exists, and that tokens reach the table encrypted.
 */
describe('social_accounts storage (e2e)', () => {
  const prisma = new PrismaService();
  const cipher = new TokenCipher(randomBytes(32).toString('base64'));
  const linker = new PrismaSocialAccountLinker(prisma, cipher);
  let first: string;
  let second: string;

  async function creator(name: string): Promise<string> {
    const user = await prisma.users.create({
      data: { email: `${MARKER}-${name}@example.com` },
    });
    const created = await prisma.creators.create({
      data: { user_id: user.id, first_name: `${MARKER} ${name}` },
    });
    return created.id;
  }

  async function cleanUp(): Promise<void> {
    // social_accounts goes with its creator (on delete cascade).
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await cleanUp();
  });

  beforeEach(async () => {
    await cleanUp();
    first = await creator('first');
    second = await creator('second');
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  // PRD 19 AC 5: one platform account belongs to one creator.
  it('refuses a TikTok account already connected to another creator', async () => {
    await expect(linker.link(first, tiktokAccount())).resolves.toBe('linked');
    await expect(linker.link(second, tiktokAccount())).resolves.toBe('taken');

    const holders = await prisma.social_accounts.findMany({
      where: { platform_user_id: OPEN_ID },
      select: { creator_id: true },
    });
    expect(holders).toEqual([{ creator_id: first }]);
  });

  // Both creators can pass the "is it free?" read before either writes; only the index then
  // keeps the account to one of them.
  it('connects the account to exactly one of two creators finishing at once', async () => {
    const results = await Promise.all([
      linker.link(first, tiktokAccount()),
      linker.link(second, tiktokAccount()),
    ]);

    expect(results.toSorted()).toEqual(['linked', 'taken']);
    await expect(
      prisma.social_accounts.count({ where: { platform_user_id: OPEN_ID } }),
    ).resolves.toBe(1);
  });

  it('has the database itself refuse a second row for the same platform account', async () => {
    await linker.link(first, tiktokAccount());

    const error = await prisma.social_accounts
      .create({
        data: {
          creator_id: second,
          platform: 'tiktok',
          username: 'someone.else',
          platform_user_id: OPEN_ID,
        },
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
  });

  it('lets one creator connect a different TikTok account than another', async () => {
    await linker.link(first, tiktokAccount());

    await expect(
      linker.link(second, tiktokAccount(`${OPEN_ID}-other`)),
    ).resolves.toBe('linked');
  });

  // PRD 19 AC 6: reconnecting replaces the tokens; one account per platform.
  it('replaces the tokens on a reconnect and keeps one row for the platform', async () => {
    await linker.link(first, tiktokAccount());
    const before = await prisma.social_accounts.findFirstOrThrow({
      where: { creator_id: first },
      select: { access_token: true },
    });

    await linker.link(first, {
      ...tiktokAccount(),
      accessToken: 'act.e2e-newer-token',
    });

    const rows = await prisma.social_accounts.findMany({
      where: { creator_id: first },
      select: { access_token: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].access_token).not.toBe(before.access_token);
    expect(cipher.decrypt(rows[0].access_token ?? '', `${first}:tiktok`)).toBe(
      'act.e2e-newer-token',
    );
  });

  // PRD 19 AC 9: the handle typed at Tambah Creator gives way to the platform's, on the record.
  describe('a username the platform changes', () => {
    async function typedAtTambahCreator(username: string): Promise<void> {
      await prisma.social_accounts.create({
        data: { creator_id: first, platform: 'tiktok', username },
      });
    }

    function changes() {
      return prisma.social_username_changes.findMany({
        where: { social_accounts: { creator_id: first } },
        orderBy: { changed_at: 'asc' },
      });
    }

    it('keeps the old and new username with the time', async () => {
      await typedAtTambahCreator('rangga.typed');

      await linker.link(first, tiktokAccount());

      const [change, ...rest] = await changes();
      expect(rest).toEqual([]);
      expect(change).toMatchObject({
        old_username: 'rangga.typed',
        new_username: 'rangga.creates',
      });
      expect(change.changed_at).toBeInstanceOf(Date);
      await expect(
        prisma.social_accounts.findFirstOrThrow({
          where: { creator_id: first },
          select: { username: true },
        }),
      ).resolves.toEqual({ username: 'rangga.creates' });
    });

    it('keeps nothing when the username is the same', async () => {
      await typedAtTambahCreator('rangga.creates');

      await linker.link(first, tiktokAccount());

      await expect(changes()).resolves.toEqual([]);
    });
  });

  // PRD 19 AC 7, 8: disconnecting deletes the tokens; the row and its username stay.
  describe('a disconnect', () => {
    const accounts = new MySocialAccountsService(prisma);

    it('leaves no token behind, and the creator can read that they are not connected', async () => {
      await linker.link(first, tiktokAccount());

      await expect(accounts.disconnect(first, 'tiktok')).resolves.toBe(true);

      await expect(
        prisma.social_accounts.findFirstOrThrow({
          where: { creator_id: first, platform: 'tiktok' },
          select: {
            username: true,
            access_token: true,
            refresh_token: true,
            token_expires_at: true,
            refresh_token_expires_at: true,
            platform_user_id: true,
            is_connected: true,
            connected_at: true,
          },
        }),
      ).resolves.toEqual({
        username: 'rangga.creates',
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        refresh_token_expires_at: null,
        platform_user_id: null,
        is_connected: false,
        connected_at: null,
      });
      await expect(accounts.list(first)).resolves.toEqual({
        accounts: [
          {
            platform: 'tiktok',
            connected: false,
            username: 'rangga.creates',
            connectedAt: null,
            lastSyncAt: null,
          },
        ],
      });
    });

    it('frees the account for another creator to connect', async () => {
      await linker.link(first, tiktokAccount());
      await accounts.disconnect(first, 'tiktok');

      await expect(linker.link(second, tiktokAccount())).resolves.toBe(
        'linked',
      );
    });

    it("cannot reach another creator's account", async () => {
      await linker.link(first, tiktokAccount());

      await expect(accounts.disconnect(second, 'tiktok')).resolves.toBe(false);
      await expect(
        prisma.social_accounts.count({
          where: { creator_id: first, is_connected: true },
        }),
      ).resolves.toBe(1);
    });
  });

  // PRD 19 AC 13: no answer about an account ever carries a token, sealed or open.
  it('answers the account with no token in it', async () => {
    await linker.link(first, tiktokAccount());
    const sealed = await prisma.social_accounts.findFirstOrThrow({
      where: { creator_id: first },
      select: { access_token: true, refresh_token: true },
    });

    const answer = JSON.stringify(
      await new MySocialAccountsService(prisma).list(first),
    );

    for (const token of [
      ACCESS,
      REFRESH,
      sealed.access_token,
      sealed.refresh_token,
    ]) {
      expect(answer).not.toContain(token);
    }
  });

  // PRD 19 AC 11-13: Admin sees the connection, and nothing of the token.
  it("shows Admin the connection and no token, in the creator's detail and the list", async () => {
    await linker.link(first, tiktokAccount());
    const creators = new CreatorsService(prisma);
    const sealed = await prisma.social_accounts.findFirstOrThrow({
      where: { creator_id: first },
      select: { access_token: true, refresh_token: true },
    });

    const detail = await creators.findOne(first);
    const list = await creators.list({ page: 1, pageSize: 100 });

    expect(detail.socialConnections?.tiktok?.connected).toBe(true);
    for (const answer of [JSON.stringify(detail), JSON.stringify(list)]) {
      for (const token of [
        ACCESS,
        REFRESH,
        sealed.access_token,
        sealed.refresh_token,
      ]) {
        expect(answer).not.toContain(token);
      }
    }
  });

  // PRD 3.6, OWASP A04:2025: a leaked table holds no usable token.
  it('stores both tokens encrypted, opening only for the creator and platform they belong to', async () => {
    await linker.link(first, tiktokAccount());

    const row = await prisma.social_accounts.findUniqueOrThrow({
      where: { creator_id_platform: { creator_id: first, platform: 'tiktok' } },
      select: { access_token: true, refresh_token: true },
    });
    for (const [stored, plain] of [
      [row.access_token, ACCESS],
      [row.refresh_token, REFRESH],
    ] as const) {
      expect(stored).toMatch(/^v1\./);
      expect(stored).not.toContain(plain);
      expect(cipher.decrypt(stored ?? '', `${first}:tiktok`)).toBe(plain);
      expect(() => cipher.decrypt(stored ?? '', `${second}:tiktok`)).toThrow();
    }
  });
});
