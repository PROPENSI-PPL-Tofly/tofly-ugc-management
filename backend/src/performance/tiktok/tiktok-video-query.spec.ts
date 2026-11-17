import {
  MAX_IDS_PER_QUERY,
  TIKTOK_VIDEO_QUERY_URL,
  TikTokTokenRejected,
  queryVideoMetrics,
} from './tiktok-video-query.js';

const TOKEN = 'act.access-token-value';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** TikTok's answer for the videos it found, as video/query sends it. */
function found(...videos: Record<string, unknown>[]): Response {
  return json({
    data: { videos, cursor: 0, has_more: false },
    error: { code: 'ok', message: '', log_id: '20261102020000' },
  });
}

function video(id: string, counts: Record<string, unknown> = {}) {
  return {
    id,
    view_count: 12400,
    like_count: 830,
    comment_count: 41,
    share_count: 9,
    ...counts,
  };
}

/** A fetch that answers each call with the next response. */
function answers(...responses: (Response | Error)[]) {
  return vi.fn<typeof fetch>(() => {
    const next = responses.shift();
    if (next === undefined) {
      return Promise.reject(new Error('unexpected request'));
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

/** The ids one call asked for. */
function idsOf(call: Parameters<typeof fetch>): string[] {
  const body = JSON.parse(String(call[1]?.body)) as {
    filters: { video_ids: string[] };
  };
  return body.filters.video_ids;
}

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    String(7432100000000000000n + BigInt(i)),
  );
}

function query(fetchImpl: typeof fetch, videoIds: string[]) {
  return queryVideoMetrics(
    fetchImpl,
    TOKEN,
    videoIds,
    AbortSignal.timeout(5000),
  );
}

describe('queryVideoMetrics', () => {
  it('reads the four counts of each video TikTok returns', async () => {
    const fetchImpl = answers(found(video('7432100000000000000')));

    const result = await query(fetchImpl, ['7432100000000000000']);

    expect(result.metrics.get('7432100000000000000')).toEqual({
      views: 12400,
      likes: 830,
      comments: 41,
      shares: 9,
    });
    expect(result.failed).toEqual([]);
  });

  // OWASP A01:2025: the token goes to TikTok's API host only, as a bearer header, never in the
  // URL, and a redirect (which would carry it elsewhere) is refused.
  it('asks video/query for exactly the four counts, with the token as a bearer', async () => {
    const fetchImpl = answers(found(video('7432100000000000000')));
    const deadline = AbortSignal.timeout(5000);

    await queryVideoMetrics(
      fetchImpl,
      TOKEN,
      ['7432100000000000000'],
      deadline,
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      `${TIKTOK_VIDEO_QUERY_URL}?fields=id%2Cview_count%2Clike_count%2Ccomment_count%2Cshare_count`,
    );
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      signal: deadline,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
    });
    expect(idsOf(fetchImpl.mock.calls[0])).toEqual(['7432100000000000000']);
    expect(String(url)).not.toContain(TOKEN);
  });

  describe('batching', () => {
    it('asks nothing for no ids', async () => {
      const fetchImpl = answers();

      const result = await query(fetchImpl, []);

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(result).toEqual({ metrics: new Map(), failed: [] });
    });

    it(`asks for exactly ${MAX_IDS_PER_QUERY} ids in one call`, async () => {
      const fetchImpl = answers(found());

      await query(fetchImpl, ids(MAX_IDS_PER_QUERY));

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(idsOf(fetchImpl.mock.calls[0])).toHaveLength(MAX_IDS_PER_QUERY);
    });

    it(`splits ${MAX_IDS_PER_QUERY + 1} ids into ${MAX_IDS_PER_QUERY} and 1`, async () => {
      const all = ids(MAX_IDS_PER_QUERY + 1);
      const fetchImpl = answers(found(), found(video(all[MAX_IDS_PER_QUERY])));

      const result = await query(fetchImpl, all);

      expect(fetchImpl.mock.calls.map((call) => idsOf(call).length)).toEqual([
        MAX_IDS_PER_QUERY,
        1,
      ]);
      expect(result.metrics.has(all[MAX_IDS_PER_QUERY])).toBe(true);
    });

    it('asks for an id named twice only once', async () => {
      const fetchImpl = answers(found());

      await query(fetchImpl, ['7432100000000000000', '7432100000000000000']);

      expect(idsOf(fetchImpl.mock.calls[0])).toEqual(['7432100000000000000']);
    });
  });

  describe('the counts', () => {
    // PRD rule 4: an empty number means "no data yet" and is never shown or counted as 0.
    it('keeps a real 0 as 0', async () => {
      const fetchImpl = answers(
        found(
          video('7432100000000000000', { share_count: 0, comment_count: 0 }),
        ),
      );

      const result = await query(fetchImpl, ['7432100000000000000']);

      expect(result.metrics.get('7432100000000000000')).toMatchObject({
        comments: 0,
        shares: 0,
      });
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['a string', '12400'],
      ['negative', -1],
      ['fractional', 1.5],
      ['not finite', Number.POSITIVE_INFINITY],
    ])('reads a %s count as no data, never 0', async (_, value) => {
      const fetchImpl = answers(
        found(video('7432100000000000000', { view_count: value })),
      );

      const result = await query(fetchImpl, ['7432100000000000000']);

      expect(result.metrics.get('7432100000000000000')?.views).toBeNull();
    });

    it('reads a count at the largest safe integer', async () => {
      const fetchImpl = answers(
        found(
          video('7432100000000000000', { view_count: Number.MAX_SAFE_INTEGER }),
        ),
      );

      const result = await query(fetchImpl, ['7432100000000000000']);

      expect(result.metrics.get('7432100000000000000')?.views).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });

    it('matches a video whose id comes back as a number', async () => {
      const fetchImpl = answers(
        found(video('7432100000000000000', { id: 7432 })),
      );

      const result = await query(fetchImpl, ['7432']);

      expect(result.metrics.has('7432')).toBe(true);
    });

    // A deleted, private or someone else's video is simply not returned (sandbox day one, #127).
    it('leaves out a video TikTok did not return', async () => {
      const fetchImpl = answers(found(video('7432100000000000000')));

      const result = await query(fetchImpl, [
        '7432100000000000000',
        '7432100000000000001',
      ]);

      expect(result.metrics.has('7432100000000000001')).toBe(false);
      expect(result.failed).toEqual([]);
    });

    it('ignores a video it did not ask for', async () => {
      const fetchImpl = answers(
        found(video('7432100000000000000'), video('9999')),
      );

      const result = await query(fetchImpl, ['7432100000000000000']);

      expect([...result.metrics.keys()]).toEqual(['7432100000000000000']);
    });

    it('skips an entry that is not a video', async () => {
      const fetchImpl = answers(
        json({
          data: {
            videos: [
              null,
              'x',
              { view_count: 1 },
              video('7432100000000000000'),
            ],
          },
          error: { code: 'ok' },
        }),
      );

      const result = await query(fetchImpl, ['7432100000000000000']);

      expect([...result.metrics.keys()]).toEqual(['7432100000000000000']);
    });
  });

  describe('a batch that fails', () => {
    // PRD 27 "Ketahanan": one failure does not stop the others; failed ids are tried next run.
    it.each([
      ['an unreachable TikTok', new TypeError('fetch failed')],
      ['a 500', json({ error: { code: 'internal_error' } }, 500)],
      [
        'a rate limit (429)',
        json({ error: { code: 'rate_limit_exceeded' } }, 429),
      ],
      [
        'an error code other than ok',
        json({ data: {}, error: { code: 'scope_not_authorized' } }),
      ],
      ['a body that is not JSON', new Response('<html>', { status: 200 })],
      [
        'an answer without a video list',
        json({ data: {}, error: { code: 'ok' } }),
      ],
      ['an answer without an error object', json({ data: { videos: [] } })],
    ])(
      'marks the batch as failed on %s and goes on with the next',
      async (_, failure) => {
        const all = ids(MAX_IDS_PER_QUERY + 1);
        const fetchImpl = answers(
          failure,
          found(video(all[MAX_IDS_PER_QUERY])),
        );

        const result = await query(fetchImpl, all);

        expect(result.failed).toEqual(all.slice(0, MAX_IDS_PER_QUERY));
        expect(result.metrics.has(all[MAX_IDS_PER_QUERY])).toBe(true);
      },
    );
  });

  describe('a token TikTok refuses', () => {
    // Every later batch would be refused too, so the account's token is the problem.
    it.each([
      [
        'an access_token_invalid code',
        json({ error: { code: 'access_token_invalid' } }, 401),
      ],
      ['a 401 without a body', new Response('', { status: 401 })],
    ])('stops on %s', async (_, refusal) => {
      const fetchImpl = answers(refusal);

      await expect(
        query(fetchImpl, ids(MAX_IDS_PER_QUERY + 1)),
      ).rejects.toBeInstanceOf(TikTokTokenRejected);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    // OWASP A09:2025: the reason is for the log, so it never carries the token.
    it('says why without the token', async () => {
      const error = await query(answers(new Response('', { status: 401 })), [
        '1',
      ]).catch((thrown: unknown) => thrown);

      expect((error as Error).message).toBe(
        'video/query refused the access token',
      );
      expect((error as Error).message).not.toContain(TOKEN);
    });
  });
});
