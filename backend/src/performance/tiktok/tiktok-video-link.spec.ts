import {
  MAX_REDIRECTS,
  TikTokLinkUnreachable,
  tiktokVideoId,
} from './tiktok-video-link.js';

const VIDEO = '7432100000000000000';
const FULL = `https://www.tiktok.com/@rangga.creates/video/${VIDEO}`;

/** A redirect to `location`, as a short link answers. */
function redirect(location: string, status = 301): Response {
  return new Response(null, { status, headers: { location } });
}

/** A fetch that answers each call with the next response, failing a call it was not given. */
function answers(...responses: (Response | Error)[]) {
  return vi.fn<typeof fetch>(() => {
    const next = responses.shift();
    if (next === undefined) {
      return Promise.reject(new Error('unexpected request'));
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

function read(link: string, fetchImpl: typeof fetch) {
  return tiktokVideoId(link, fetchImpl, AbortSignal.timeout(5000));
}

describe('tiktokVideoId', () => {
  describe('a full TikTok link', () => {
    // Read from the link alone, with the same rule as the link's unique key (38.1).
    it.each([
      [FULL],
      [`${FULL}?is_from_webapp=1&sender_device=pc`],
      [`https://tiktok.com/@rangga.creates/video/${VIDEO}/`],
      [`https://m.tiktok.com/@rangga.creates/video/${VIDEO}`],
      [`https://www.tiktok.com/@another.handle/video/${VIDEO}`],
      [`https://www.tiktok.com/v/${VIDEO}.html`],
    ])('reads the video id from %s without asking TikTok', async (link) => {
      const fetchImpl = answers();

      await expect(read(link, fetchImpl)).resolves.toBe(VIDEO);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('a short link', () => {
    it.each([
      ['https://vt.tiktok.com/ZSxyz12/'],
      ['https://vm.tiktok.com/ZMabc34/'],
    ])('follows %s to the video it stands for', async (link) => {
      const fetchImpl = answers(redirect(`${FULL}?_r=1&_t=8abc`));

      await expect(read(link, fetchImpl)).resolves.toBe(VIDEO);
    });

    // OWASP A01:2025 (SSRF): each hop is checked before it is fetched, so the redirect is
    // followed by hand, under the caller's deadline.
    it('asks for the redirect itself, under the caller deadline', async () => {
      const fetchImpl = answers(redirect(FULL));
      const deadline = AbortSignal.timeout(5000);

      await tiktokVideoId(
        'https://vt.tiktok.com/ZSxyz12/',
        fetchImpl,
        deadline,
      );

      expect(fetchImpl).toHaveBeenCalledWith(
        'https://vt.tiktok.com/ZSxyz12/',
        expect.objectContaining({
          method: 'GET',
          redirect: 'manual',
          signal: deadline,
        }),
      );
    });

    it.each([301, 302, 303, 307, 308])(
      'follows a %i redirect',
      async (status) => {
        await expect(
          read(
            'https://vt.tiktok.com/ZSxyz12/',
            answers(redirect(FULL, status)),
          ),
        ).resolves.toBe(VIDEO);
      },
    );

    it('follows a redirect given as a path on the same host', async () => {
      const fetchImpl = answers(redirect('/ZSxyz12-next/'), redirect(FULL));

      await expect(
        read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
      ).resolves.toBe(VIDEO);
      expect(fetchImpl.mock.calls[1][0]).toBe(
        'https://vt.tiktok.com/ZSxyz12-next/',
      );
    });

    it(`follows up to ${MAX_REDIRECTS} redirects within TikTok`, async () => {
      const fetchImpl = answers(
        redirect('https://vm.tiktok.com/ZMabc34/'),
        redirect('https://www.tiktok.com/t/ZTdef56/'),
        redirect(FULL),
      );

      await expect(
        read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
      ).resolves.toBe(VIDEO);
      expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS);
    });

    it(`gives up after ${MAX_REDIRECTS} redirects that never reach a video`, async () => {
      const fetchImpl = answers(
        redirect('https://vm.tiktok.com/ZM1/'),
        redirect('https://vm.tiktok.com/ZM2/'),
        redirect('https://vm.tiktok.com/ZM3/'),
        redirect(FULL),
      );

      await expect(
        read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
      ).resolves.toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS);
    });

    // OWASP A01:2025 (SSRF): a redirect off TikTok is never fetched.
    it.each([
      ['another site', 'https://example.com/@rangga.creates/video/1'],
      ['a look-alike host', 'https://eviltiktok.com/ZSxyz12/'],
      [
        'a host under another domain',
        'https://tiktok.com.evil.example/ZSxyz12/',
      ],
      ['an internal address', 'http://169.254.169.254/latest/meta-data/'],
      ['plain http on TikTok', 'http://vm.tiktok.com/ZMabc34/'],
      [
        'a TikTok host with credentials',
        'https://user:pass@vm.tiktok.com/ZMabc34/',
      ],
      ['a TikTok host with a port', 'https://vm.tiktok.com:8443/ZMabc34/'],
    ])(
      'reads a redirect to %s as no video, without following it',
      async (_, location) => {
        const fetchImpl = answers(redirect(location));

        await expect(
          read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
        ).resolves.toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      },
    );

    it('reads a redirect to a TikTok page that is not a video as no video', async () => {
      // An unknown or expired code lands on TikTok's home page.
      const fetchImpl = answers(redirect('https://www.tiktok.com/'));

      await expect(
        read('https://vt.tiktok.com/ZSgone/', fetchImpl),
      ).resolves.toBeNull();
    });

    it.each([200, 400, 404, 410])(
      'reads a %i answer as no video',
      async (status) => {
        const fetchImpl = answers(new Response('<html></html>', { status }));

        await expect(
          read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
        ).resolves.toBeNull();
      },
    );

    it('reads a redirect without a location as no video', async () => {
      const fetchImpl = answers(new Response(null, { status: 302 }));

      await expect(
        read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
      ).resolves.toBeNull();
    });

    it('reads a redirect whose location is not a URL as no video', async () => {
      const fetchImpl = answers(redirect('https://['));

      await expect(
        read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
      ).resolves.toBeNull();
    });

    // Not knowing is not "not found": the link is tried again on the next run (27.4).
    it.each([500, 502, 503, 429])(
      'fails on a %i answer, so the link is tried again later',
      async (status) => {
        const fetchImpl = answers(new Response('', { status }));

        await expect(
          read('https://vt.tiktok.com/ZSxyz12/', fetchImpl),
        ).rejects.toBeInstanceOf(TikTokLinkUnreachable);
      },
    );

    it('fails when TikTok cannot be reached or the deadline passes', async () => {
      const fetchImpl = answers(new DOMException('timed out', 'TimeoutError'));

      const error = await read(
        'https://vt.tiktok.com/ZSxyz12/',
        fetchImpl,
      ).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(TikTokLinkUnreachable);
      expect((error as Error).message).toBe('short link unreachable');
    });
  });

  describe('a link that is not a TikTok video', () => {
    it.each([
      ['an Instagram post', 'https://www.instagram.com/p/DAbC123xyz/'],
      ['a TikTok profile', 'https://www.tiktok.com/@rangga.creates'],
      [
        'a look-alike of TikTok',
        'https://www.tiktok.com.evil.example/@a/video/1',
      ],
      [
        'a short-link look-alike',
        'https://vt.tiktok.com.evil.example/ZSxyz12/',
      ],
      ['text that is not a URL', 'tiktok video 7432100000000000000'],
      ['an empty link', ''],
    ])('reads %s as no video, without asking anyone', async (_, link) => {
      const fetchImpl = answers();

      await expect(read(link, fetchImpl)).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});
