import { INSTAGRAM_GRAPH_URL } from '../../social/instagram/instagram-client.js';
import type { SourceResult } from '../ports.js';
import {
  INSTAGRAM_API_VERSION,
  InstagramPerformanceSource,
  type InstagramAccounts,
} from './instagram-performance-source.js';

const CREATOR = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const IG_ID = '17841400000000000';
const TOKEN = 'IGAA-long-lived-token';
const NOW = new Date(Date.UTC(2026, 10, 2, 19, 0, 0));
const DAY_MS = 24 * 60 * 60 * 1000;
const API = `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}`;

const reel = (shortcode: string) =>
  `https://www.instagram.com/reel/${shortcode}/`;

type Reply = { status?: number; body?: unknown; raw?: string } | 'network';

interface Instagram {
  // Each page of the account's media list, in order.
  pages?: Reply[];
  // The insights answer per media id.
  insights?: Record<string, Reply>;
}

function metric(name: string, value: number) {
  return { name, period: 'lifetime', values: [{ value }] };
}

const FULL_INSIGHTS: Reply = {
  body: {
    data: [
      metric('views', 12400),
      metric('likes', 830),
      metric('comments', 41),
      metric('shares', 17),
    ],
  },
};

const ONE_PAGE: Reply[] = [
  {
    body: {
      data: [
        { id: 'm-1', shortcode: 'AAA111' },
        { id: 'm-2', shortcode: 'BBB222' },
      ],
      paging: { cursors: { after: 'end' } },
    },
  },
];

// Stands in for Instagram: the media list page by page (the `after` cursor names the page),
// and each media's insights.
function instagram({ pages = ONE_PAGE, insights = {} }: Instagram = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input));
    let reply: Reply | undefined;
    if (url.pathname.endsWith(`/${IG_ID}/media`)) {
      const after = url.searchParams.get('after');
      reply = pages[after === null ? 0 : Number(after.replace('page-', ''))];
    } else {
      const mediaId = url.pathname.split('/').at(-2) ?? '';
      reply = insights[mediaId] ?? FULL_INSIGHTS;
    }
    if (reply === undefined || reply === 'network') {
      throw new TypeError('fetch failed');
    }
    return new Response(reply.raw ?? JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
    });
  });
}

function accountsWith(account: Awaited<ReturnType<InstagramAccounts['find']>>) {
  return {
    find: vi.fn<InstagramAccounts['find']>().mockResolvedValue(account),
    saveToken: vi.fn<InstagramAccounts['saveToken']>().mockResolvedValue(),
    disconnect: vi.fn<InstagramAccounts['disconnect']>().mockResolvedValue(),
  };
}

// A connected account whose token is far from expiring, so nothing is refreshed here.
const CONNECTED = {
  platformUserId: IG_ID,
  accessToken: TOKEN,
  expiresAt: new Date(NOW.getTime() + 50 * DAY_MS),
};

function sourceWith(
  fetchImpl: ReturnType<typeof instagram>,
  accounts = accountsWith(CONNECTED),
) {
  return new InstagramPerformanceSource(
    accounts,
    fetchImpl as unknown as typeof fetch,
    () => NOW,
  );
}

async function read(
  links: { id: string; url: string }[],
  fake: Instagram = {},
): Promise<{ result: SourceResult; fetchImpl: ReturnType<typeof instagram> }> {
  const fetchImpl = instagram(fake);
  const result = await sourceWith(fetchImpl).read(CREATOR, links);
  return { result, fetchImpl };
}

describe('InstagramPerformanceSource', () => {
  it('reads Instagram', () => {
    expect(sourceWith(instagram()).platform).toBe('instagram');
  });

  it('reads nothing for a creator with no connected Instagram account', async () => {
    const fetchImpl = instagram();
    const accounts = accountsWith(null);

    const result = await sourceWith(fetchImpl, accounts).read(CREATOR, [
      { id: 'link-1', url: reel('AAA111') },
    ]);

    expect(accounts.find).toHaveBeenCalledWith(CREATOR);
    expect(result).toEqual({ outcome: 'disconnected' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks Instagram nothing when there is no link to read', async () => {
    const { result, fetchImpl } = await read([]);

    expect(result).toEqual({ outcome: 'read', readings: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("matches a link to the account's media and reads its four numbers (AC 10, 2)", async () => {
    const { result } = await read([{ id: 'link-1', url: reel('BBB222') }]);

    expect(result).toEqual({
      outcome: 'read',
      readings: [
        {
          linkId: 'link-1',
          outcome: 'synced',
          metrics: { views: 12400, likes: 830, comments: 41, shares: 17 },
        },
      ],
    });
  });

  it('lists the media of the connected account and asks for the four metrics of the matched one', async () => {
    const { fetchImpl } = await read([{ id: 'link-1', url: reel('BBB222') }]);

    const urls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(`${urls[0].origin}${urls[0].pathname}`).toBe(
      `${API}/${IG_ID}/media`,
    );
    expect(urls[0].searchParams.get('fields')).toBe('id,shortcode');
    expect(urls[0].searchParams.get('access_token')).toBe(TOKEN);
    expect(`${urls[1].origin}${urls[1].pathname}`).toBe(`${API}/m-2/insights`);
    expect(urls[1].searchParams.get('metric')).toBe(
      'views,likes,comments,shares',
    );
    expect(urls[1].searchParams.get('access_token')).toBe(TOKEN);
  });

  // An Instagram redirect would carry the token to wherever it points.
  it('never follows a redirect', async () => {
    const { fetchImpl } = await read([{ id: 'link-1', url: reel('BBB222') }]);

    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  // Instagram answers a metric it has no data for with nothing, not with 0 (AC 2).
  it('keeps a metric Instagram did not return empty, and a real 0 as 0', async () => {
    const { result } = await read([{ id: 'link-1', url: reel('AAA111') }], {
      insights: {
        'm-1': {
          body: {
            data: [
              metric('views', 0),
              { name: 'likes', period: 'lifetime', values: [] },
              { name: 'comments', period: 'lifetime', values: [{}] },
            ],
          },
        },
      },
    });

    expect(result).toEqual({
      outcome: 'read',
      readings: [
        {
          linkId: 'link-1',
          outcome: 'synced',
          metrics: { views: 0, likes: null, comments: null, shares: null },
        },
      ],
    });
  });

  it('keeps a value that is not a whole number of at least 0 empty', async () => {
    const { result } = await read([{ id: 'link-1', url: reel('AAA111') }], {
      insights: {
        'm-1': {
          body: {
            data: [
              metric('views', -1),
              metric('likes', 1.5),
              { name: 'comments', values: [{ value: '41' }] },
              'not a metric',
            ],
          },
        },
      },
    });

    expect(result).toMatchObject({
      readings: [
        {
          metrics: { views: null, likes: null, comments: null, shares: null },
        },
      ],
    });
  });

  // A video from another account, deleted or made private is not in the list (AC 8, 10, 11).
  it("reads a link missing from the account's media as not found", async () => {
    const { result, fetchImpl } = await read([
      { id: 'link-1', url: reel('ZZZ999') },
    ]);

    expect(result).toEqual({
      outcome: 'read',
      readings: [{ linkId: 'link-1', outcome: 'not_found' }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reads a link that is not an Instagram post as not found, without asking Instagram', async () => {
    const { result, fetchImpl } = await read([
      {
        id: 'link-1',
        url: 'https://www.tiktok.com/@rangga/video/7432100000000000000',
      },
    ]);

    expect(result).toEqual({
      outcome: 'read',
      readings: [{ linkId: 'link-1', outcome: 'not_found' }],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows the media list to its next page', async () => {
    const { result } = await read([{ id: 'link-1', url: reel('CCC333') }], {
      pages: [
        {
          body: {
            data: [{ id: 'm-1', shortcode: 'AAA111' }],
            paging: { cursors: { after: 'page-1' }, next: 'https://x/next' },
          },
        },
        { body: { data: [{ id: 'm-3', shortcode: 'CCC333' }] } },
      ],
    });

    expect(result).toMatchObject({
      readings: [{ linkId: 'link-1', outcome: 'synced' }],
    });
  });

  it('stops listing once every link is found', async () => {
    const { fetchImpl } = await read([{ id: 'link-1', url: reel('AAA111') }], {
      pages: [
        {
          body: {
            data: [{ id: 'm-1', shortcode: 'AAA111' }],
            paging: { cursors: { after: 'page-1' }, next: 'https://x/next' },
          },
        },
        'network',
      ],
    });

    const listed = fetchImpl.mock.calls.filter(([input]) =>
      String(input).includes('/media?'),
    );
    expect(listed).toHaveLength(1);
  });

  it('skips list entries it cannot read', async () => {
    const { result } = await read([{ id: 'link-1', url: reel('AAA111') }], {
      pages: [
        {
          body: {
            data: [
              null,
              { id: 7, shortcode: 'AAA111' },
              { id: 'm-1', shortcode: 'AAA111' },
            ],
          },
        },
      ],
    });

    expect(result).toMatchObject({
      readings: [{ linkId: 'link-1', outcome: 'synced' }],
    });
  });

  // One failing run is retried in the next one (AC 6); the numbers already kept stay.
  it.each<[string, Reply]>([
    ['an error answer', { status: 500, body: { error: { message: 'x' } } }],
    ['no answer', 'network'],
    ['an answer with no list', { body: { paging: {} } }],
  ])(
    'reads every link as failed when the media list gets %s',
    async (_what, reply) => {
      const { result } = await read(
        [
          { id: 'link-1', url: reel('AAA111') },
          { id: 'link-2', url: reel('BBB222') },
        ],
        { pages: [reply] },
      );

      expect(result).toEqual({
        outcome: 'read',
        readings: [
          { linkId: 'link-1', outcome: 'failed', reason: expect.any(String) },
          { linkId: 'link-2', outcome: 'failed', reason: expect.any(String) },
        ],
      });
    },
  );

  // Retrying can never match a link that is not an Instagram post, so it is not failed.
  it('still reads a link that is not an Instagram post as not found when the media list fails', async () => {
    const { result } = await read(
      [
        { id: 'link-1', url: 'https://www.tiktok.com/@rangga/video/7432' },
        { id: 'link-2', url: reel('BBB222') },
      ],
      { pages: ['network'] },
    );

    expect(result).toEqual({
      outcome: 'read',
      readings: [
        { linkId: 'link-1', outcome: 'not_found' },
        {
          linkId: 'link-2',
          outcome: 'failed',
          reason: 'media list: Instagram unreachable',
        },
      ],
    });
  });

  it('fails only the link whose insights could not be read', async () => {
    const { result } = await read(
      [
        { id: 'link-1', url: reel('AAA111') },
        { id: 'link-2', url: reel('BBB222') },
      ],
      { insights: { 'm-1': { status: 400, body: { error: {} } } } },
    );

    expect(result).toEqual({
      outcome: 'read',
      readings: [
        {
          linkId: 'link-1',
          outcome: 'failed',
          reason: 'insights: Instagram answered 400',
        },
        {
          linkId: 'link-2',
          outcome: 'synced',
          metrics: { views: 12400, likes: 830, comments: 41, shares: 17 },
        },
      ],
    });
  });

  it.each<[string, Reply, string]>([
    ['no JSON', { raw: '<html>' }, 'insights: Instagram sent no usable answer'],
    [
      'no data list',
      { body: { data: 'x' } },
      'insights: Instagram sent no usable answer',
    ],
    ['no answer', 'network', 'insights: Instagram unreachable'],
  ])(
    'fails a link whose insights come back with %s',
    async (_what, reply, reason) => {
      const { result } = await read([{ id: 'link-1', url: reel('AAA111') }], {
        insights: { 'm-1': reply },
      });

      expect(result).toEqual({
        outcome: 'read',
        readings: [{ linkId: 'link-1', outcome: 'failed', reason }],
      });
    },
  );

  // The reason reaches the sync's log (27.4), so it names the step and never the token.
  it('never puts the token in a failure reason', async () => {
    const { result } = await read([{ id: 'link-1', url: reel('AAA111') }], {
      pages: [{ status: 500, body: { error: { message: TOKEN } } }],
    });

    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
