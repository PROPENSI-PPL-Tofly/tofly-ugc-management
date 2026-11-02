import {
  INSTAGRAM_GRAPH_URL,
  INSTAGRAM_TIMEOUT_MS,
} from '../../social/instagram/instagram-client.js';
import type {
  LinkReading,
  PerformanceMetrics,
  PerformanceSource,
  SourceLink,
  SourceResult,
} from '../ports.js';
import { instagramShortcode } from './instagram-shortcode.js';

export const INSTAGRAM_API_VERSION = 'v23.0';

// Instagram's largest page; 20 of them reach a creator's 2,000 newest posts, far past any
// contract's links, without listing an account with years of posts to the end.
const MEDIA_PAGE_SIZE = 100;
export const MAX_MEDIA_PAGES = 20;

const METRICS = ['views', 'likes', 'comments', 'shares'] as const;

// A connected Instagram account, its token already decrypted.
export interface InstagramAccount {
  platformUserId: string;
  accessToken: string;
  expiresAt: Date | null;
}

// Where the adapter keeps the account it reads with (social_accounts, through TokenCipher).
export interface InstagramAccounts {
  find(creatorId: string): Promise<InstagramAccount | null>;
  saveToken(
    creatorId: string,
    accessToken: string,
    expiresAt: Date,
  ): Promise<void>;
  disconnect(creatorId: string): Promise<void>;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Why a call to Instagram failed, in words safe for the log: the step, never a token or the body.
class InstagramReadError extends Error {}

// A metric's value only when Instagram gave a whole number of at least 0; anything else, an
// empty list included, is no data rather than 0 (AC 2).
function metricOf(data: unknown[], name: string): number | null {
  const entry = data.find((item) => isRecord(item) && item.name === name);
  const values = isRecord(entry) ? entry.values : undefined;
  const first: unknown = Array.isArray(values) ? values[0] : undefined;
  const value = isRecord(first) ? first.value : undefined;
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

// Instagram API with Instagram Login as a PerformanceSource (PBI-27, 27.2): each link's shortcode
// is matched against the connected account's own media list, so a video from another account is
// never read (AC 10, 11), and the four numbers come from that media's insights. `fetch` and the
// clock are injected so tests stand in for Instagram.
export class InstagramPerformanceSource implements PerformanceSource {
  readonly platform = 'instagram' as const;

  constructor(
    private readonly accounts: InstagramAccounts,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(
    creatorId: string,
    links: readonly SourceLink[],
  ): Promise<SourceResult> {
    const account = await this.accounts.find(creatorId);
    if (!account) {
      return { outcome: 'disconnected' };
    }

    const shortcodes = new Map(
      links.map((link) => [link.id, instagramShortcode(link.url)]),
    );
    const wanted = new Set(
      [...shortcodes.values()].filter((code): code is string => code !== null),
    );

    let media = new Map<string, string>();
    if (wanted.size > 0) {
      try {
        media = await this.mediaIds(account, wanted);
      } catch (error) {
        const reason = (error as InstagramReadError).message;
        return {
          outcome: 'read',
          readings: links.map((link) =>
            shortcodes.get(link.id) === null
              ? { linkId: link.id, outcome: 'not_found' }
              : { linkId: link.id, outcome: 'failed', reason },
          ),
        };
      }
    }

    const readings: LinkReading[] = [];
    for (const link of links) {
      const code = shortcodes.get(link.id);
      const mediaId = code ? media.get(code) : undefined;
      readings.push(
        mediaId === undefined
          ? { linkId: link.id, outcome: 'not_found' }
          : await this.reading(link.id, mediaId, account),
      );
    }
    return { outcome: 'read', readings };
  }

  // The account's media, shortcode to media id, page by page until every wanted one is found.
  private async mediaIds(
    account: InstagramAccount,
    wanted: ReadonlySet<string>,
  ): Promise<Map<string, string>> {
    const media = new Map<string, string>();
    let after: string | undefined;
    for (let page = 0; page < MAX_MEDIA_PAGES; page++) {
      const params = new URLSearchParams({
        fields: 'id,shortcode',
        limit: String(MEDIA_PAGE_SIZE),
        access_token: account.accessToken,
      });
      if (after !== undefined) {
        params.set('after', after);
      }
      const body = await this.call(
        'media list',
        `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(account.platformUserId)}/media?${params.toString()}`,
      );
      if (!Array.isArray(body.data)) {
        throw new InstagramReadError(
          'media list: Instagram sent no usable answer',
        );
      }
      for (const item of body.data as unknown[]) {
        if (
          isRecord(item) &&
          typeof item.id === 'string' &&
          typeof item.shortcode === 'string'
        ) {
          media.set(item.shortcode, item.id);
        }
      }

      const paging = isRecord(body.paging) ? body.paging : {};
      const cursors = isRecord(paging.cursors) ? paging.cursors : {};
      const allFound = [...wanted].every((code) => media.has(code));
      if (
        allFound ||
        paging.next === undefined ||
        typeof cursors.after !== 'string'
      ) {
        break;
      }
      after = cursors.after;
    }
    return media;
  }

  // One matched link's four numbers. A failure here fails only this link.
  private async reading(
    linkId: string,
    mediaId: string,
    account: InstagramAccount,
  ): Promise<LinkReading> {
    const params = new URLSearchParams({
      metric: METRICS.join(','),
      access_token: account.accessToken,
    });
    try {
      const body = await this.call(
        'insights',
        `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(mediaId)}/insights?${params.toString()}`,
      );
      const { data } = body;
      if (!Array.isArray(data)) {
        throw new InstagramReadError(
          'insights: Instagram sent no usable answer',
        );
      }
      const metrics = Object.fromEntries(
        METRICS.map((name) => [name, metricOf(data as unknown[], name)]),
      ) as unknown as PerformanceMetrics;
      return { linkId, outcome: 'synced', metrics };
    } catch (error) {
      return {
        linkId,
        outcome: 'failed',
        reason: (error as InstagramReadError).message,
      };
    }
  }

  // One GET to Instagram: no redirect followed (it would carry the token wherever it points) and
  // cut off after INSTAGRAM_TIMEOUT_MS. Every failure names only the step and what went wrong.
  private async call(step: string, url: string): Promise<Json> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(INSTAGRAM_TIMEOUT_MS),
      });
    } catch {
      throw new InstagramReadError(`${step}: Instagram unreachable`);
    }
    if (!response.ok) {
      throw new InstagramReadError(
        `${step}: Instagram answered ${response.status}`,
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!isRecord(body)) {
      throw new InstagramReadError(`${step}: Instagram sent no usable answer`);
    }
    return body;
  }
}
