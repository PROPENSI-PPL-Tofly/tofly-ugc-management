import type {
  PrismaSocialTokenStore,
  StoredTokens,
} from '../../social/social-token-store.js';
import {
  RefreshRefused,
  RefreshUnavailable,
  type TokenRefresher,
} from '../../social/token-refresh.js';
import type {
  LinkReading,
  PerformanceSource,
  SyncLink,
} from '../performance-source.js';
import { tiktokVideoId } from './tiktok-video-link.js';
import { queryVideoMetrics } from './tiktok-video-query.js';

/** A token expiring within this is refreshed first, so it cannot expire during the read. */
export const REFRESH_MARGIN_MS = 15 * 60_000;

/** The token store calls the adapter needs (Interface Segregation). */
export type TikTokTokens = Pick<
  PrismaSocialTokenStore,
  'load' | 'replace' | 'disconnect'
>;

export interface WarningLog {
  warn(message: string): void;
}

/** A link's video, or what the link came to when it names none. */
type Match = { video: string } | { state: 'not_found' | 'failed' };

/**
 * The TikTok source of performance numbers (PBI-27, 27.3): each link is matched to its video
 * (a share link followed first), the token refreshed when due, and the counts read with
 * video/query, 20 ids a call. Each piece is injected, so tests stand in for TikTok and the
 * database (Dependency Inversion).
 */
export class TikTokPerformanceSource implements PerformanceSource {
  readonly platform = 'tiktok' as const;

  constructor(
    private readonly tokens: TikTokTokens,
    private readonly refresher: TokenRefresher,
    private readonly log: WarningLog,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Epoch milliseconds now. */
    private readonly now: () => number = Date.now,
  ) {}

  async read(
    creatorId: string,
    links: readonly SyncLink[],
    deadline: AbortSignal,
  ): Promise<LinkReading[]> {
    if (links.length === 0) {
      return [];
    }
    const all = (state: 'not_connected' | 'failed'): LinkReading[] =>
      links.map((link) => ({ linkId: link.id, state }));

    const stored = await this.tokens.load(creatorId, 'tiktok');
    if (stored === null) {
      return all('not_connected');
    }
    const access = await this.accessToken(creatorId, stored, deadline);
    if (access === 'not_connected' || access === 'failed') {
      return all(access);
    }

    const matches = await Promise.all(
      links.map((link) => this.match(link, deadline)),
    );
    const videos = matches.flatMap((match) =>
      'video' in match ? [match.video] : [],
    );
    let found: Awaited<ReturnType<typeof queryVideoMetrics>>;
    try {
      found = await queryVideoMetrics(this.fetchImpl, access, videos, deadline);
    } catch {
      // queryVideoMetrics rejects only with TikTokTokenRejected: a token refused although not
      // expired (revoked in TikTok). The next run's refresh finds out.
      found = { metrics: new Map(), failed: videos };
    }

    return links.map((link, index): LinkReading => {
      const match = matches[index];
      if (!('video' in match)) {
        return { linkId: link.id, state: match.state };
      }
      const metrics = found.metrics.get(match.video);
      if (metrics !== undefined) {
        return { linkId: link.id, state: 'synced', metrics };
      }
      const state = found.failed.includes(match.video) ? 'failed' : 'not_found';
      return { linkId: link.id, state };
    });
  }

  /**
   * A token good for the whole read: the stored one, or a refreshed one when it expires within
   * the margin. A refresh TikTok refuses disconnects the account (PRD 27); one it cannot do now
   * leaves the account as it is.
   */
  private async accessToken(
    creatorId: string,
    stored: StoredTokens,
    deadline: AbortSignal,
  ): Promise<string | 'not_connected' | 'failed'> {
    const expires = stored.accessTokenExpiresAt?.getTime();
    if (expires !== undefined && expires > this.now() + REFRESH_MARGIN_MS) {
      return stored.accessToken;
    }
    try {
      if (stored.refreshToken === null) {
        throw new RefreshRefused('no refresh token to renew the access token');
      }
      const refreshed = await this.refresher.refresh(
        stored.refreshToken,
        deadline,
      );
      await this.tokens.replace(creatorId, 'tiktok', stored.handle, refreshed);
      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof RefreshUnavailable) {
        return 'failed';
      }
      if (!(error instanceof RefreshRefused)) {
        throw error;
      }
      await this.tokens.disconnect(creatorId, 'tiktok', stored.handle);
      this.log.warn(
        `TikTok disconnected for creator ${creatorId}: ${error.message}`,
      );
      return 'not_connected';
    }
  }

  /** The video a link names, following a share link under the deadline. */
  private async match(link: SyncLink, deadline: AbortSignal): Promise<Match> {
    try {
      const video = await tiktokVideoId(link.url, this.fetchImpl, deadline);
      return video === null ? { state: 'not_found' } : { video };
    } catch {
      // tiktokVideoId rejects only with TikTokLinkUnreachable: TikTok cannot answer now.
      return { state: 'failed' };
    }
  }
}
