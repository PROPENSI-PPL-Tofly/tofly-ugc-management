import type { StoredTokens } from '../../social/social-token-store.js';
import {
  RefreshRefused,
  RefreshUnavailable,
} from '../../social/token-refresh.js';
import type { PerformanceSource, SourceLink } from '../ports.js';
import {
  REFRESH_MARGIN_MS,
  TIKTOK_READ_TIMEOUT_MS,
  TikTokPerformanceSource,
} from './tiktok-performance-source.js';
import { TIKTOK_VIDEO_QUERY_URL } from './tiktok-video-query.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const NOW = new Date('2026-11-02T19:00:00.000Z'); // 02.00 WIB, the daily sync
const VIDEO_A = '7432100000000000001';
const VIDEO_B = '7432100000000000002';

const link = (id: string, url: string): SourceLink => ({ id, url });
const full = (video: string) =>
  `https://www.tiktok.com/@rangga.creates/video/${video}`;

function tokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    handle: 'v1.sealed-access',
    accessToken: 'act.stored-access',
    accessTokenExpiresAt: new Date(NOW.getTime() + 6 * 3_600_000),
    refreshToken: 'rft.stored-refresh',
    refreshTokenExpiresAt: new Date(NOW.getTime() + 300 * 86_400_000),
    ...overrides,
  };
}

const REFRESHED = {
  accessToken: 'act.new-access',
  accessTokenExpiresAt: new Date(NOW.getTime() + 86_400_000),
  refreshToken: 'rft.new-refresh',
  refreshTokenExpiresAt: new Date(NOW.getTime() + 365 * 86_400_000),
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** video/query's answer for the videos it found. */
function found(...videos: string[]): Response {
  return json({
    data: {
      videos: videos.map((id) => ({
        id,
        view_count: 12400,
        like_count: 830,
        comment_count: 41,
        share_count: 0,
      })),
    },
    error: { code: 'ok' },
  });
}

/**
 * A stand-in for TikTok: share links redirect as `shortLinks` says (an Error rejects), and
 * video/query answers with `query`.
 */
function tiktok(
  query: () => Response | Promise<Response> = () => found(VIDEO_A, VIDEO_B),
  shortLinks: Record<string, string | Error> = {},
) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.startsWith(TIKTOK_VIDEO_QUERY_URL)) {
      return query();
    }
    const target = shortLinks[url];
    if (target instanceof Error) {
      throw target;
    }
    return target === undefined
      ? new Response(null, { status: 404 })
      : new Response(null, { status: 301, headers: { location: target } });
  });
}

function setup(
  options: {
    stored?: StoredTokens | null;
    fetchImpl?: ReturnType<typeof tiktok>;
    refresh?: () => Promise<typeof REFRESHED>;
  } = {},
) {
  const store = {
    load: vi
      .fn()
      .mockResolvedValue(
        options.stored === undefined ? tokens() : options.stored,
      ),
    replace: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(true),
  };
  const refresher = {
    refresh: vi.fn(options.refresh ?? (() => Promise.resolve(REFRESHED))),
  };
  const log = { warn: vi.fn() };
  const fetchImpl = options.fetchImpl ?? tiktok();
  const source = new TikTokPerformanceSource(
    store,
    refresher,
    log,
    fetchImpl,
    () => NOW.getTime(),
  );
  const read = (links: SourceLink[], deadline = AbortSignal.timeout(5000)) =>
    source.read(CREATOR, links, deadline);
  return { store, refresher, log, fetchImpl, source, read };
}

/** The port's answer for an account it could read with. */
const readAs = (readings: unknown[]) => ({ outcome: 'read', readings });

/** The bearer token video/query was called with. */
function bearerOf(fetchImpl: ReturnType<typeof tiktok>): string | undefined {
  const call = fetchImpl.mock.calls.find(([url]) =>
    String(url).startsWith(TIKTOK_VIDEO_QUERY_URL),
  );
  return (call?.[1]?.headers as Record<string, string> | undefined)
    ?.authorization;
}

describe('TikTokPerformanceSource', () => {
  // One port for every platform (#138's ports.ts), so the sync (27.4) reads Instagram and
  // TikTok alike.
  it('is the TikTok PerformanceSource of ports.ts', () => {
    const port: PerformanceSource = new TikTokPerformanceSource(
      { load: vi.fn(), replace: vi.fn(), disconnect: vi.fn() },
      { refresh: vi.fn() },
      { warn: vi.fn() },
    );

    expect(port.platform).toBe('tiktok');
  });

  // The port asks no deadline, so a read called through it still ends: within Finalize's 20 s.
  it('gives a read called without a deadline TIKTOK_READ_TIMEOUT_MS of its own', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { fetchImpl, source } = setup();

    await source.read(CREATOR, [link('l1', full(VIDEO_A))]);

    expect(TIKTOK_READ_TIMEOUT_MS).toBe(20_000);
    expect(timeout).toHaveBeenCalledWith(TIKTOK_READ_TIMEOUT_MS);
    const deadline = timeout.mock.results.at(-1)?.value as AbortSignal;
    expect(fetchImpl.mock.calls[0][1]?.signal).toBe(deadline);
    timeout.mockRestore();
  });

  it('reads the four counts of each link, in the order the links came', async () => {
    const { read } = setup();

    await expect(
      read([link('l2', full(VIDEO_B)), link('l1', full(VIDEO_A))]),
    ).resolves.toEqual(
      readAs([
        {
          linkId: 'l2',
          outcome: 'synced',
          metrics: { views: 12400, likes: 830, comments: 41, shares: 0 },
        },
        {
          linkId: 'l1',
          outcome: 'synced',
          metrics: { views: 12400, likes: 830, comments: 41, shares: 0 },
        },
      ]),
    );
  });

  it('asks nothing, not even for the tokens, when there are no links', async () => {
    const { store, fetchImpl, read } = setup();

    await expect(read([])).resolves.toEqual(readAs([]));
    expect(store.load).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // PRD 27 AC "6 state": "Akun belum terhubung", once for the account.
  it('answers disconnected when the creator has no TikTok connected', async () => {
    const { fetchImpl, read } = setup({ stored: null });

    await expect(
      read([link('l1', full(VIDEO_A)), link('l2', full(VIDEO_B))]),
    ).resolves.toEqual({ outcome: 'disconnected' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe('matching links to videos (PRD 27 "Pencocokan link")', () => {
    it('follows a share link to its video before asking for the counts', async () => {
      const { read } = setup({
        fetchImpl: tiktok(() => found(VIDEO_A), {
          'https://vt.tiktok.com/ZSxyz12/': full(VIDEO_A),
        }),
      });

      await expect(
        read([link('l1', 'https://vt.tiktok.com/ZSxyz12/')]),
      ).resolves.toEqual(
        readAs([expect.objectContaining({ linkId: 'l1', outcome: 'synced' })]),
      );
    });

    // A video deleted, made private, or posted from another account than the connected one is
    // not returned: "Link tidak ditemukan", and 27.4 keeps the last numbers.
    it('reads a video TikTok did not return as not found', async () => {
      const { read } = setup({ fetchImpl: tiktok(() => found(VIDEO_A)) });

      await expect(
        read([link('l1', full(VIDEO_A)), link('l2', full(VIDEO_B))]),
      ).resolves.toEqual(
        readAs([
          expect.objectContaining({ linkId: 'l1', outcome: 'synced' }),
          { linkId: 'l2', outcome: 'not_found' },
        ]),
      );
    });

    it.each([
      ['a share link that leads to no video', 'https://vt.tiktok.com/ZSgone/'],
      ['a link that is not TikTok', 'https://www.instagram.com/p/DAbC123xyz/'],
    ])(
      'reads %s as not found without asking for its counts',
      async (_, url) => {
        const { fetchImpl, read } = setup({ fetchImpl: tiktok(() => found()) });

        await expect(read([link('l1', url)])).resolves.toEqual(
          readAs([{ linkId: 'l1', outcome: 'not_found' }]),
        );
        expect(bearerOf(fetchImpl)).toBeUndefined();
      },
    );

    // PRD 27 "Ketahanan": one link failing does not stop the others.
    it('reads a share link TikTok cannot follow now as failed, and the rest as usual', async () => {
      const { read } = setup({
        fetchImpl: tiktok(() => found(VIDEO_A), {
          'https://vt.tiktok.com/ZSdown/': new TypeError('fetch failed'),
        }),
      });

      await expect(
        read([
          link('l1', 'https://vt.tiktok.com/ZSdown/'),
          link('l2', full(VIDEO_A)),
        ]),
      ).resolves.toEqual(
        readAs([
          {
            linkId: 'l1',
            outcome: 'failed',
            reason: 'share link unreachable',
          },
          expect.objectContaining({ linkId: 'l2', outcome: 'synced' }),
        ]),
      );
    });

    it('reads the links of a batch video/query failed as failed', async () => {
      const { read } = setup({
        fetchImpl: tiktok(() => json({ error: { code: 'x' } }, 500)),
      });

      await expect(read([link('l1', full(VIDEO_A))])).resolves.toEqual(
        readAs([
          { linkId: 'l1', outcome: 'failed', reason: 'video/query failed' },
        ]),
      );
    });

    it('reads the links as failed when video/query refuses the token', async () => {
      const { store, read } = setup({
        fetchImpl: tiktok(() =>
          json({ error: { code: 'access_token_invalid' } }, 401),
        ),
      });

      await expect(
        read([
          link('l1', full(VIDEO_A)),
          link('l2', 'https://www.instagram.com/p/x/'),
        ]),
      ).resolves.toEqual(
        readAs([
          {
            linkId: 'l1',
            outcome: 'failed',
            reason: 'video/query refused the token',
          },
          { linkId: 'l2', outcome: 'not_found' },
        ]),
      );
      // A token that is refused but not expired is found out by the next run's refresh.
      expect(store.disconnect).not.toHaveBeenCalled();
    });

    it('passes the caller deadline to every call to TikTok', async () => {
      const deadline = AbortSignal.timeout(5000);
      const { fetchImpl, read } = setup({
        fetchImpl: tiktok(() => found(VIDEO_A), {
          'https://vt.tiktok.com/ZSxyz12/': full(VIDEO_A),
        }),
      });

      await read([link('l1', 'https://vt.tiktok.com/ZSxyz12/')], deadline);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      for (const [, init] of fetchImpl.mock.calls) {
        expect(init?.signal).toBe(deadline);
      }
    });
  });

  describe('the access token (PRD 27: refreshed before the sync)', () => {
    it('uses a stored token that outlives the margin, without refreshing', async () => {
      const { refresher, fetchImpl, read } = setup({
        stored: tokens({
          accessTokenExpiresAt: new Date(NOW.getTime() + REFRESH_MARGIN_MS + 1),
        }),
      });

      await read([link('l1', full(VIDEO_A))]);

      expect(refresher.refresh).not.toHaveBeenCalled();
      expect(bearerOf(fetchImpl)).toBe('Bearer act.stored-access');
    });

    it.each([
      [
        'expires exactly at the margin',
        new Date(NOW.getTime() + REFRESH_MARGIN_MS),
      ],
      ['has already expired', new Date(NOW.getTime() - 1)],
      ['has no known expiry', null],
    ])(
      'refreshes a token that %s, and reads with the new one',
      async (_, expiresAt) => {
        const deadline = AbortSignal.timeout(5000);
        const { store, refresher, fetchImpl, read } = setup({
          stored: tokens({ accessTokenExpiresAt: expiresAt }),
        });

        await read([link('l1', full(VIDEO_A))], deadline);

        expect(refresher.refresh).toHaveBeenCalledWith(
          'rft.stored-refresh',
          deadline,
        );
        expect(store.replace).toHaveBeenCalledWith(
          CREATOR,
          'tiktok',
          'v1.sealed-access',
          REFRESHED,
        );
        expect(bearerOf(fetchImpl)).toBe('Bearer act.new-access');
      },
    );

    // The creator reconnected while the sync refreshed: the new connection's tokens stay, and
    // this read still has fresh tokens of its own to finish with.
    it('reads on when the refreshed tokens land on no connection', async () => {
      const { store, read } = setup({
        stored: tokens({ accessTokenExpiresAt: null }),
      });
      store.replace.mockResolvedValue(false);

      await expect(read([link('l1', full(VIDEO_A))])).resolves.toEqual(
        readAs([expect.objectContaining({ outcome: 'synced' })]),
      );
    });

    // PRD 27 "Ketahanan": refresh fails → the account is "Belum terhubung" and its links
    // "Akun belum terhubung".
    it('disconnects the account and answers disconnected when TikTok refuses the refresh', async () => {
      const { store, fetchImpl, log, read } = setup({
        stored: tokens({ accessTokenExpiresAt: null }),
        refresh: () =>
          Promise.reject(
            new RefreshRefused(
              'token endpoint refused the refresh: invalid_grant',
            ),
          ),
      });

      await expect(
        read([link('l1', full(VIDEO_A)), link('l2', full(VIDEO_B))]),
      ).resolves.toEqual({ outcome: 'disconnected' });
      expect(store.disconnect).toHaveBeenCalledWith(
        CREATOR,
        'tiktok',
        'v1.sealed-access',
      );
      expect(bearerOf(fetchImpl)).toBeUndefined();
      // OWASP A09:2025: the disconnect is logged with why, and never with a token.
      expect(log.warn).toHaveBeenCalledWith(
        `TikTok disconnected for creator ${CREATOR}: token endpoint refused the refresh: invalid_grant`,
      );
    });

    it('disconnects an account whose expired token has no refresh token to renew it', async () => {
      const { store, refresher, read } = setup({
        stored: tokens({ accessTokenExpiresAt: null, refreshToken: null }),
      });

      await expect(read([link('l1', full(VIDEO_A))])).resolves.toEqual({
        outcome: 'disconnected',
      });
      expect(refresher.refresh).not.toHaveBeenCalled();
      expect(store.disconnect).toHaveBeenCalledWith(
        CREATOR,
        'tiktok',
        'v1.sealed-access',
      );
    });

    // An outage is not a refusal: the account stays connected and its links are tried again.
    it('keeps the account and reads its links as failed when the refresh is unavailable', async () => {
      const { store, fetchImpl, read } = setup({
        stored: tokens({ accessTokenExpiresAt: null }),
        refresh: () =>
          Promise.reject(new RefreshUnavailable('token endpoint unreachable')),
      });

      await expect(read([link('l1', full(VIDEO_A))])).resolves.toEqual(
        readAs([
          {
            linkId: 'l1',
            outcome: 'failed',
            reason: 'token endpoint unreachable',
          },
        ]),
      );
      expect(store.disconnect).not.toHaveBeenCalled();
      expect(store.replace).not.toHaveBeenCalled();
      expect(bearerOf(fetchImpl)).toBeUndefined();
    });

    it('passes on a failure it does not know', async () => {
      const failure = new Error('database down');
      const { read } = setup({
        stored: tokens({ accessTokenExpiresAt: null }),
        refresh: () => Promise.reject(failure),
      });

      await expect(read([link('l1', full(VIDEO_A))])).rejects.toBe(failure);
    });
  });
});
