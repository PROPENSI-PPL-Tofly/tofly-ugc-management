import { Prisma } from '@prisma/client';
import {
  firstLink,
  isLinkTaken,
  linkPlatforms,
  normalizeVideoLink,
} from './content-links.js';

describe('normalizeVideoLink', () => {
  it.each([
    ['https://www.instagram.com/reel/C9xYz/', 'instagram:C9xYz'],
    ['https://instagram.com/reel/C9xYz', 'instagram:C9xYz'],
    ['http://instagram.com/reel/C9xYz', 'instagram:C9xYz'],
    [
      'https://INSTAGRAM.com/reel/C9xYz?igsh=abc&utm_source=copy',
      'instagram:C9xYz',
    ],
    [
      'https://www.tiktok.com/@creator/video/7312345678901234567#comments',
      'tiktok:7312345678901234567',
    ],
    // A short link names no video id; it keeps the host-and-path key until it is resolved.
    ['https://vm.tiktok.com/ZMabc123//', 'vm.tiktok.com/ZMabc123'],
    ['  https://vt.tiktok.com/ZSxyz/  ', 'vt.tiktok.com/ZSxyz'],
  ])('keys %s as %s', (link, key) => {
    expect(normalizeVideoLink(link)).toBe(key);
  });

  it('keys the same video the same way however the link was copied', () => {
    const copies = [
      'https://www.instagram.com/reel/C9xYz/',
      'http://instagram.com/reel/C9xYz?igsh=MTc4',
      'HTTPS://Instagram.com/reel/C9xYz#',
    ];

    expect(new Set(copies.map(normalizeVideoLink))).toEqual(
      new Set(['instagram:C9xYz']),
    );
  });

  // PBI-38 AC 5: one Instagram post is reachable as a post, a reel, a reels page, a TV page,
  // or under its owner's handle, so the key is its short code alone.
  it.each([
    'https://www.instagram.com/p/DAbC123xyz/',
    'https://www.instagram.com/reel/DAbC123xyz',
    'https://www.instagram.com/reels/DAbC123xyz/',
    'https://www.instagram.com/tv/DAbC123xyz',
    'https://www.instagram.com/rangga.creates/reel/DAbC123xyz/?igsh=MTc4',
    'https://m.instagram.com/p/DAbC123xyz',
  ])('keys the Instagram post %s by its short code', (link) => {
    expect(normalizeVideoLink(link)).toBe('instagram:DAbC123xyz');
  });

  // The handle in a TikTok link may be typed in any case, or be another one entirely after a
  // rename; the video id is what names the video.
  it.each([
    'https://www.tiktok.com/@Rangga.Creates/video/7432100000000000000',
    'https://www.tiktok.com/@rangga.creates/video/7432100000000000000?is_from_webapp=1',
    'https://m.tiktok.com/@rangga/video/7432100000000000000',
    'https://tiktok.com/@old.handle/video/7432100000000000000/',
    'https://m.tiktok.com/v/7432100000000000000.html',
  ])('keys the TikTok video %s by its video id', (link) => {
    expect(normalizeVideoLink(link)).toBe('tiktok:7432100000000000000');
  });

  it('reads a video id only on its own platform\'s host', () => {
    expect(normalizeVideoLink('https://example.com/p/DAbC123xyz')).toBe(
      'example.com/p/DAbC123xyz',
    );
    expect(normalizeVideoLink('https://example.com/@a/video/123')).toBe(
      'example.com/@a/video/123',
    );
    expect(normalizeVideoLink('https://instagram.com.evil.example/p/DAbC')).toBe(
      'instagram.com.evil.example/p/DAbC',
    );
  });

  it('keeps a platform link that names no post or video by its host and path', () => {
    expect(normalizeVideoLink('https://www.instagram.com/rangga.creates/')).toBe(
      'instagram.com/rangga.creates',
    );
    expect(normalizeVideoLink('https://www.tiktok.com/@rangga')).toBe(
      'tiktok.com/@rangga',
    );
  });

  it('keeps the path as typed, since Instagram and TikTok short codes are case-sensitive', () => {
    expect(normalizeVideoLink('https://www.instagram.com/reel/AbC/')).not.toBe(
      normalizeVideoLink('https://www.instagram.com/reel/abc/'),
    );
  });

  it('keeps two videos of one account apart', () => {
    expect(normalizeVideoLink('https://www.tiktok.com/@a/video/1')).not.toBe(
      normalizeVideoLink('https://www.tiktok.com/@a/video/2'),
    );
  });

  it('strips only a leading www, not a host that merely contains it', () => {
    expect(normalizeVideoLink('https://wwwinstagram.com/reel/x')).toBe(
      'wwwinstagram.com/reel/x',
    );
  });

  it('strips a long run of slashes in time that grows with the link, not with its square', () => {
    // A trailing-slash regex backtracks on every slash before a non-slash: 100k slashes took
    // seconds. Links are capped at 2048 characters upstream, but the key must not depend on it.
    const slashes = `https://example.com/x${'/'.repeat(100_000)}y`;
    const started = performance.now();

    const key = normalizeVideoLink(slashes);

    expect(performance.now() - started).toBeLessThan(250);
    expect(key).toBe(`example.com/x${'/'.repeat(100_000)}y`);
    expect(normalizeVideoLink(`https://vm.tiktok.com/ZM${'/'.repeat(100_000)}`)).toBe(
      'vm.tiktok.com/ZM',
    );
  });

  it('reads a video id in time that grows with the link, however long the path around it', () => {
    const long = 'a'.repeat(100_000);
    const started = performance.now();

    normalizeVideoLink(`https://www.instagram.com/${long}/${long}`);
    normalizeVideoLink(`https://www.tiktok.com/@${long}/${long}`);

    expect(performance.now() - started).toBeLessThan(250);
  });

  it('keys a host with no path as the host alone', () => {
    expect(normalizeVideoLink('https://example.com/')).toBe('example.com');
    expect(normalizeVideoLink('https://example.com')).toBe('example.com');
  });

  it('keys a stored value that is not a URL by its lowercase text, so nothing kept from before is dropped', () => {
    expect(normalizeVideoLink(' Not-A-Link ')).toBe('not-a-link');
  });
});

describe('firstLink', () => {
  const link = (platform: 'instagram' | 'tiktok' | null, day: string) => ({
    platform,
    submitted_at: new Date(`${day}T00:00:00.000Z`),
  });

  it('is the earliest submitted link, whose day is the content submitted day', () => {
    const tiktok = link('tiktok', '2026-10-30');
    const instagram = link('instagram', '2026-10-28');

    expect(firstLink([tiktok, instagram])).toBe(instagram);
  });

  it('keeps the read order between two links of the same day', () => {
    const instagram = link('instagram', '2026-10-28');
    const tiktok = link('tiktok', '2026-10-28');

    expect(firstLink([tiktok, instagram])).toBe(tiktok);
  });

  it('is undefined before any link is submitted', () => {
    expect(firstLink([])).toBeUndefined();
  });

  it('does not reorder the list it reads', () => {
    const links = [link('tiktok', '2026-10-30'), link('instagram', '2026-10-28')];

    firstLink(links);

    expect(links.map((each) => each.platform)).toEqual(['tiktok', 'instagram']);
  });
});

describe('linkPlatforms', () => {
  it('lists each platform with a link once, Instagram before TikTok', () => {
    expect(
      linkPlatforms([
        { platform: 'tiktok' },
        { platform: 'instagram' },
        { platform: 'tiktok' },
      ]),
    ).toEqual(['instagram', 'tiktok']);
  });

  it('leaves out a link kept from before platforms were recorded', () => {
    expect(linkPlatforms([{ platform: null }, { platform: 'tiktok' }])).toEqual([
      'tiktok',
    ]);
  });

  it('is empty before any link is submitted', () => {
    expect(linkPlatforms([])).toEqual([]);
  });
});

describe('isLinkTaken', () => {
  function uniqueViolation(target: unknown) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target },
    });
  }

  it('is a unique violation on the link key, as Prisma names it by field', () => {
    expect(isLinkTaken(uniqueViolation(['normalized_url']))).toBe(true);
  });

  it('is a unique violation on the link key, as Prisma names it by index', () => {
    expect(isLinkTaken(uniqueViolation('content_links_normalized_url_key'))).toBe(
      true,
    );
  });

  it('is not the one-link-per-platform rule, which is a different refusal', () => {
    expect(isLinkTaken(uniqueViolation(['content_id', 'platform']))).toBe(false);
  });

  it('is not any other database error', () => {
    const notFound = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: 'test',
      meta: { target: ['normalized_url'] },
    });

    expect(isLinkTaken(notFound)).toBe(false);
    expect(isLinkTaken(new Error('normalized_url'))).toBe(false);
    expect(isLinkTaken(undefined)).toBe(false);
  });
});
