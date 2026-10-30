import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.js';
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
