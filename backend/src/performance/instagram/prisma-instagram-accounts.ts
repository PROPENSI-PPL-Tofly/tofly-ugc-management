import type { PrismaService } from '../../prisma/prisma.service.js';
import type { TokenCipher } from '../../social/token-cipher.js';
import type {
  InstagramAccount,
  InstagramAccounts,
} from './instagram-performance-source.js';

// The slice of Prisma this touches, so tests stub exactly that.
export type InstagramAccountRows = Pick<PrismaService, 'social_accounts'>;

// A creator's connected Instagram account in social_accounts, as PrismaSocialAccountLinker (19.3)
// keeps it: the token sealed with TokenCipher under the creator and the platform, opened only
// here, server side, and sealed again when it is refreshed (OWASP A04:2025).
export class PrismaInstagramAccounts implements InstagramAccounts {
  constructor(
    private readonly rows: InstagramAccountRows,
    private readonly cipher: TokenCipher,
  ) {}

  async find(creatorId: string): Promise<InstagramAccount | null> {
    const row = await this.rows.social_accounts.findUnique({
      where: {
        creator_id_platform: { creator_id: creatorId, platform: 'instagram' },
      },
      select: {
        is_connected: true,
        platform_user_id: true,
        access_token: true,
        token_expires_at: true,
      },
    });
    // Connected only with a platform account behind it, as connectionOf (19.3) reads it.
    if (
      !row?.is_connected ||
      row.platform_user_id === null ||
      row.access_token === null
    ) {
      return null;
    }

    let accessToken: string;
    try {
      accessToken = this.cipher.decrypt(row.access_token, context(creatorId));
    } catch {
      return null;
    }
    return {
      platformUserId: row.platform_user_id,
      accessToken,
      expiresAt: row.token_expires_at,
    };
  }

  async saveToken(
    creatorId: string,
    accessToken: string,
    expiresAt: Date,
  ): Promise<void> {
    // Only onto a row still connected: a creator who pressed Putuskan meanwhile gets no token back.
    await this.rows.social_accounts.updateMany({
      where: {
        creator_id: creatorId,
        platform: 'instagram',
        is_connected: true,
      },
      data: {
        access_token: this.cipher.encrypt(accessToken, context(creatorId)),
        token_expires_at: expiresAt,
      },
    });
  }

  // The PBI-19 badge then reads "Belum terhubung" (AC 7). The platform account and the username
  // stay, so a reconnect lands on the same row; the dead token does not.
  async disconnect(creatorId: string): Promise<void> {
    await this.rows.social_accounts.updateMany({
      where: { creator_id: creatorId, platform: 'instagram' },
      data: {
        is_connected: false,
        access_token: null,
        token_expires_at: null,
        platform_user_id: null,
        connected_at: null,
      },
    });
  }
}

// The associated data PrismaSocialAccountLinker seals Instagram's token with.
function context(creatorId: string): string {
  return `${creatorId}:instagram`;
}
