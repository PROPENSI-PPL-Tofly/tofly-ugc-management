import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { latestSyncs, syncKey } from './latest-syncs.js';
import type { SocialPlatform } from './oauth-state.js';
import {
  CONNECTION_COLUMNS,
  connectionOf,
  type SocialConnection,
  withLastSync,
} from './social-connection.js';

/** The slice of Prisma the service touches, so tests stub exactly that. */
export type MySocialAccountRows = Pick<
  PrismaService,
  'social_accounts' | '$queryRaw'
>;

/** One row of the Akun Terhubung panel. */
export interface MySocialAccount extends SocialConnection {
  platform: SocialPlatform;
  username: string;
}

export interface MySocialAccounts {
  accounts: MySocialAccount[];
}

/** The creator's own connected accounts (PBI-19, 19.3). Tokens are never read here. */
@Injectable()
export class MySocialAccountsService {
  constructor(
    @Inject(PrismaService)
    private readonly rows: MySocialAccountRows,
  ) {}

  async list(creatorId: string): Promise<MySocialAccounts> {
    const [rows, syncs] = await Promise.all([
      this.rows.social_accounts.findMany({
        where: { creator_id: creatorId },
        orderBy: { platform: 'asc' },
        select: { platform: true, username: true, ...CONNECTION_COLUMNS },
      }),
      latestSyncs(this.rows, [creatorId]),
    ]);
    return {
      accounts: rows.map((row) => ({
        platform: row.platform,
        username: row.username,
        ...withLastSync(
          connectionOf(row),
          syncs.get(syncKey(creatorId, row.platform)),
        ),
      })),
    };
  }

  /**
   * Deletes the tokens and frees the platform account for whoever connects it next. The row
   * stays, with the username, because the creator's account on that platform is still theirs
   * (Tambah Creator's data) and numbers already synced stay with their links. False when
   * nothing was connected there.
   */
  async disconnect(
    creatorId: string,
    platform: SocialPlatform,
  ): Promise<boolean> {
    const { count } = await this.rows.social_accounts.updateMany({
      where: {
        creator_id: creatorId,
        platform,
        platform_user_id: { not: null },
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
    return count > 0;
  }
}
