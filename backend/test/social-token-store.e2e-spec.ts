import { randomBytes } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { PlatformAccount } from '../src/social/ports.js';
import { PrismaSocialAccountLinker } from '../src/social/prisma-social-account-linker.js';
import { PrismaSocialTokenStore } from '../src/social/social-token-store.js';
import { TokenCipher } from '../src/social/token-cipher.js';

const MARKER = 'e2e-social-token-store';

function tiktokAccount(access: string, refresh: string): PlatformAccount {
  return {
    platform: 'tiktok',
    platformUserId: `${MARKER}-open-id`,
    username: 'rangga.creates',
    accessToken: access,
    accessTokenExpiresAt: new Date(Date.now() + 86_400_000),
    refreshToken: refresh,
    refreshTokenExpiresAt: new Date(Date.now() + 31_536_000_000),
  };
}

const REFRESHED = {
  accessToken: 'act.refreshed',
  accessTokenExpiresAt: new Date('2026-11-04T02:00:00.000Z'),
  refreshToken: 'rft.refreshed',
  refreshTokenExpiresAt: new Date('2027-11-03T02:00:00.000Z'),
};

/**
 * The sync's token store against the real database (PBI-27, 27.3). The unit tests stub Prisma,
 * so they show the store asks for the right rows; these show the rows really are read, sealed
 * and guarded, above all that a sync never writes over a connection the creator made meanwhile.
 */
describe('social token store (e2e)', () => {
  const prisma = new PrismaService();
  const cipher = new TokenCipher(randomBytes(32).toString('base64'));
  const linker = new PrismaSocialAccountLinker(prisma, cipher);
  const store = new PrismaSocialTokenStore(prisma, cipher);
  let creator: string;

  async function cleanUp(): Promise<void> {
    // social_accounts goes with its creator (on delete cascade).
    await prisma.creators.deleteMany({
      where: { first_name: { startsWith: MARKER } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARKER } } });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await cleanUp();
    const user = await prisma.users.create({
      data: { email: `${MARKER}@example.com` },
    });
    creator = (
      await prisma.creators.create({
        data: { user_id: user.id, first_name: `${MARKER} Rangga` },
      })
    ).id;
    await linker.link(creator, tiktokAccount('act.first', 'rft.first'));
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  function row() {
    return prisma.social_accounts.findUniqueOrThrow({
      where: {
        creator_id_platform: { creator_id: creator, platform: 'tiktok' },
      },
    });
  }

  it('opens the tokens the connect stored', async () => {
    await expect(store.load(creator, 'tiktok')).resolves.toMatchObject({
      accessToken: 'act.first',
      refreshToken: 'rft.first',
    });
  });

  // OWASP A04:2025: what reaches the table is sealed, never the token itself.
  it('stores refreshed tokens sealed, and opens them next time', async () => {
    const before = await store.load(creator, 'tiktok');

    await expect(
      store.replace(creator, 'tiktok', before!.handle, REFRESHED),
    ).resolves.toBe(true);

    const stored = await row();
    expect(stored.access_token).toMatch(/^v1\./);
    expect(stored.access_token).not.toContain('act.refreshed');
    expect(stored.refresh_token).not.toContain('rft.refreshed');
    await expect(store.load(creator, 'tiktok')).resolves.toMatchObject({
      accessToken: 'act.refreshed',
      accessTokenExpiresAt: REFRESHED.accessTokenExpiresAt,
      refreshToken: 'rft.refreshed',
    });
  });

  // The creator reconnects while the sync refreshes: the reconnect's tokens stay.
  it('does not write refreshed tokens over a reconnect made meanwhile', async () => {
    const before = await store.load(creator, 'tiktok');
    await linker.link(
      creator,
      tiktokAccount('act.reconnected', 'rft.reconnected'),
    );

    await expect(
      store.replace(creator, 'tiktok', before!.handle, REFRESHED),
    ).resolves.toBe(false);

    await expect(store.load(creator, 'tiktok')).resolves.toMatchObject({
      accessToken: 'act.reconnected',
    });
  });

  // PRD 27: a refused refresh leaves the account "Belum terhubung", username kept.
  it('disconnects the account it read, keeping the username', async () => {
    const before = await store.load(creator, 'tiktok');

    await expect(
      store.disconnect(creator, 'tiktok', before!.handle),
    ).resolves.toBe(true);

    expect(await row()).toMatchObject({
      username: 'rangga.creates',
      is_connected: false,
      access_token: null,
      refresh_token: null,
      platform_user_id: null,
    });
    await expect(store.load(creator, 'tiktok')).resolves.toBeNull();
  });

  it('does not disconnect a reconnect made meanwhile', async () => {
    const before = await store.load(creator, 'tiktok');
    await linker.link(
      creator,
      tiktokAccount('act.reconnected', 'rft.reconnected'),
    );

    await expect(
      store.disconnect(creator, 'tiktok', before!.handle),
    ).resolves.toBe(false);

    expect(await row()).toMatchObject({ is_connected: true });
  });
});
