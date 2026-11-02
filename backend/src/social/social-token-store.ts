import type { PrismaService } from '../prisma/prisma.service.js';
import type { SocialPlatform } from './oauth-state.js';
import type { TokenCipher } from './token-cipher.js';

/** The slice of Prisma the store touches, so tests stub exactly that. */
export type SocialTokenRows = Pick<PrismaService, 'social_accounts'>;

/** A connected account's tokens, opened for a sync (PBI-27). Never logged, never sent out. */
export interface StoredTokens {
  /**
   * The access token as stored, sealed. A write after a refresh passes it back, so it lands
   * only on the connection it was read from.
   */
  handle: string;
  accessToken: string;
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
}

/** Tokens a platform handed back on a refresh. */
export interface RefreshedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
}

/**
 * The tokens of a creator's connected account, for the performance adapters (27.2, 27.3). The
 * tokens are opened only here and sealed again before they are written (OWASP A04:2025).
 *
 * Every write is bound to the token it replaces (`handle`): a creator who reconnects or
 * disconnects while a sync runs keeps what they did, and the sync's write lands nowhere.
 */
export class PrismaSocialTokenStore {
  constructor(
    private readonly rows: SocialTokenRows,
    private readonly cipher: TokenCipher,
  ) {}

  /** The account's tokens, or null when it is not connected or its tokens do not open. */
  async load(
    creatorId: string,
    platform: SocialPlatform,
  ): Promise<StoredTokens | null> {
    const row = await this.rows.social_accounts.findUnique({
      where: { creator_id_platform: { creator_id: creatorId, platform } },
      select: {
        access_token: true,
        token_expires_at: true,
        refresh_token: true,
        refresh_token_expires_at: true,
        platform_user_id: true,
      },
    });
    if (row?.platform_user_id == null || row.access_token === null) {
      return null;
    }

    const context = `${creatorId}:${platform}`;
    try {
      return {
        handle: row.access_token,
        accessToken: this.cipher.decrypt(row.access_token, context),
        accessTokenExpiresAt: row.token_expires_at,
        refreshToken:
          row.refresh_token === null
            ? null
            : this.cipher.decrypt(row.refresh_token, context),
        refreshTokenExpiresAt: row.refresh_token_expires_at,
      };
    } catch {
      // decrypt fails only with TokenCipherError: a token sealed for another creator, or not
      // sealed at all, is no token of this account.
      return null;
    }
  }

  /** Stores refreshed tokens. False when the connection changed since `handle` was read. */
  async replace(
    creatorId: string,
    platform: SocialPlatform,
    handle: string,
    tokens: RefreshedTokens,
  ): Promise<boolean> {
    const context = `${creatorId}:${platform}`;
    const { count } = await this.rows.social_accounts.updateMany({
      where: { creator_id: creatorId, platform, access_token: handle },
      data: {
        access_token: this.cipher.encrypt(tokens.accessToken, context),
        token_expires_at: tokens.accessTokenExpiresAt,
        refresh_token:
          tokens.refreshToken === null
            ? null
            : this.cipher.encrypt(tokens.refreshToken, context),
        refresh_token_expires_at: tokens.refreshTokenExpiresAt,
      },
    });
    return count > 0;
  }

  /**
   * Disconnects an account whose tokens no longer work (PRD 27: a failed refresh leaves it
   * "Belum terhubung"). The row and its username stay, as a creator's own Putuskan leaves
   * them. False when the connection changed since `handle` was read.
   */
  async disconnect(
    creatorId: string,
    platform: SocialPlatform,
    handle: string,
  ): Promise<boolean> {
    const { count } = await this.rows.social_accounts.updateMany({
      where: { creator_id: creatorId, platform, access_token: handle },
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
    return count > 0;
  }
}
