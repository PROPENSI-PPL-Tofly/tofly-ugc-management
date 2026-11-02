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
  SourceLink,
  SourceResult,
} from '../ports.js';
import { tiktokVideoId } from './tiktok-video-link.js';
import { queryVideoMetrics } from './tiktok-video-query.js';

/** A token expiring within this is refreshed first, so it cannot expire during the read. */
export const REFRESH_MARGIN_MS = 15 * 60_000;

/**
 * How long one creator's read may take when the caller gives no deadline, as the port does not:
 * the 20 s Finalize waits for its last sync (PBI-28), so even that read ends in time.
 */
export const TIKTOK_READ_TIMEOUT_MS = 20_000;

/** The token store calls the adapter needs (Interface Segregation). */
export type TikTokTokens = Pick<
  PrismaSocialTokenStore,
  'load' | 'replace' | 'disconnect'
>;

export interface WarningLog {
  warn(message: string): void;
}

/** A link's video, or what the link came to when it names none. */
type Match =
  | { video: string }
  | { outcome: 'not_found' }
  | { outcome: 'failed'; reason: string };

/** A token to read with, or why there is none. */
type Access =
  | { token: string }
  | { outcome: 'disconnected' }
  | { outcome: 'failed'; reason: string };

/**
 * The TikTok source of performance numbers (PBI-27, 27.3), behind the PerformanceSource of
 * ports.ts that Instagram (27.2) implements too: each link is matched to its video (a share link
 * followed first), the token refreshed when due, and the counts read with video/query, 20 ids a
 * call. Each piece is injected, so tests stand in for TikTok and the database (Dependency
 * Inversion). Failure reasons name the step only, never a token (OWASP A09:2025).
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

  /** Every call to TikTok stops at `deadline`: the caller's, or TIKTOK_READ_TIMEOUT_MS. */
  async read(
    creatorId: string,
    links: readonly SourceLink[],
    deadline: AbortSignal = AbortSignal.timeout(TIKTOK_READ_TIMEOUT_MS),
  ): Promise<SourceResult> {
    if (links.length === 0) {
      return { outcome: 'read', readings: [] };
    }

    const stored = await this.tokens.load(creatorId, 'tiktok');
    if (stored === null) {
      return { outcome: 'disconnected' };
    }
    const access = await this.accessToken(creatorId, stored, deadline);
    if (!('token' in access)) {
      if (access.outcome === 'disconnected') {
        return access;
      }
      // Retried in the next run (AC 6); the account stays connected.
      const { reason } = access;
      return {
        outcome: 'read',
        readings: links.map((link) => ({
          linkId: link.id,
          outcome: 'failed',
          reason,
        })),
      };
    }

    const matches = await Promise.all(
      links.map((link) => this.match(link, deadline)),
    );
    const videos = matches.flatMap((match) =>
      'video' in match ? [match.video] : [],
    );
    let found: Awaited<ReturnType<typeof queryVideoMetrics>>;
    let failure = 'video/query failed';
    try {
      found = await queryVideoMetrics(
        this.fetchImpl,
        access.token,
        videos,
        deadline,
      );
    } catch {
      // queryVideoMetrics rejects only with TikTokTokenRejected: a token refused although not
      // expired (revoked in TikTok). The next run's refresh finds out.
      found = { metrics: new Map(), failed: videos };
      failure = 'video/query refused the token';
    }

    const readings = links.map((link, index): LinkReading => {
      const match = matches[index];
      if (!('video' in match)) {
        return { linkId: link.id, ...match };
      }
      const metrics = found.metrics.get(match.video);
      if (metrics !== undefined) {
        return { linkId: link.id, outcome: 'synced', metrics };
      }
      return found.failed.includes(match.video)
        ? { linkId: link.id, outcome: 'failed', reason: failure }
        : { linkId: link.id, outcome: 'not_found' };
    });
    return { outcome: 'read', readings };
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
  ): Promise<Access> {
    const expires = stored.accessTokenExpiresAt?.getTime();
    if (expires !== undefined && expires > this.now() + REFRESH_MARGIN_MS) {
      return { token: stored.accessToken };
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
      return { token: refreshed.accessToken };
    } catch (error) {
      if (error instanceof RefreshUnavailable) {
        return { outcome: 'failed', reason: error.message };
      }
      if (!(error instanceof RefreshRefused)) {
        throw error;
      }
      await this.tokens.disconnect(creatorId, 'tiktok', stored.handle);
      this.log.warn(
        `TikTok disconnected for creator ${creatorId}: ${error.message}`,
      );
      return { outcome: 'disconnected' };
    }
  }

  /** The video a link names, following a share link under the deadline. */
  private async match(link: SourceLink, deadline: AbortSignal): Promise<Match> {
    try {
      const video = await tiktokVideoId(link.url, this.fetchImpl, deadline);
      return video === null ? { outcome: 'not_found' } : { video };
    } catch {
      // tiktokVideoId rejects only with TikTokLinkUnreachable: TikTok cannot answer now.
      return { outcome: 'failed', reason: 'share link unreachable' };
    }
  }
}
