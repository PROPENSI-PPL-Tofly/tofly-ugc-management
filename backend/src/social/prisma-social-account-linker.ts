import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type {
  LinkResult,
  PlatformAccount,
  SocialAccountLinker,
} from './ports.js';
import type { TokenCipher } from './token-cipher.js';

/** The slice of Prisma the linker touches, so tests stub exactly that. */
export type SocialAccountRows = Pick<PrismaService, 'social_accounts'>;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Keeps a connected account in social_accounts (PBI-19; the store 19.3 builds its endpoints on).
 * One row per creator and platform, so a reconnect replaces the earlier account and its tokens;
 * one creator per platform account, enforced by the unique key on (platform, platform_user_id).
 */
export class PrismaSocialAccountLinker implements SocialAccountLinker {
  constructor(
    private readonly rows: SocialAccountRows,
    private readonly cipher: TokenCipher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async link(creatorId: string, account: PlatformAccount): Promise<LinkResult> {
    if (await this.heldByAnother(creatorId, account)) {
      return 'taken';
    }

    // The tokens open only for this creator and platform (associated data).
    const context = `${creatorId}:${account.platform}`;
    const values = {
      platform_user_id: account.platformUserId,
      // The platform's handle replaces the one typed at Tambah Creator (PRD 19, Username).
      username: account.username,
      access_token: this.cipher.encrypt(account.accessToken, context),
      token_expires_at: account.accessTokenExpiresAt,
      refresh_token:
        account.refreshToken === null
          ? null
          : this.cipher.encrypt(account.refreshToken, context),
      refresh_token_expires_at: account.refreshTokenExpiresAt,
      is_connected: true,
      connected_at: this.now(),
    };

    try {
      await this.rows.social_accounts.upsert({
        where: {
          creator_id_platform: {
            creator_id: creatorId,
            platform: account.platform,
          },
        },
        create: {
          creator_id: creatorId,
          platform: account.platform,
          ...values,
        },
        update: values,
      });
    } catch (error) {
      // Two creators finishing the same account at once both saw it free; the unique key let
      // the other one land first.
      if (
        isUniqueViolation(error) &&
        (await this.heldByAnother(creatorId, account))
      ) {
        return 'taken';
      }
      throw error;
    }
    return 'linked';
  }

  private async heldByAnother(
    creatorId: string,
    account: PlatformAccount,
  ): Promise<boolean> {
    const holder = await this.rows.social_accounts.findUnique({
      where: {
        platform_platform_user_id: {
          platform: account.platform,
          platform_user_id: account.platformUserId,
        },
      },
      select: { creator_id: true },
    });
    return holder !== null && holder.creator_id !== creatorId;
  }
}
