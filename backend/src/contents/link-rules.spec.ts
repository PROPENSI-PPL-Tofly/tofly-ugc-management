import {
  checkPlatformLink,
  isSocialPlatform,
  LINK_RULES,
  MAX_LINK_LENGTH,
} from './link-rules.js';

const INSTAGRAM_HINT =
  'Link harus dari Instagram (instagram.com/reel/... atau /p/...)';
const TIKTOK_HINT =
  'Link harus dari TikTok (tiktok.com/@user/video/... atau vt.tiktok.com/...)';

describe('checkPlatformLink', () => {
  it.each([
    'https://www.instagram.com/reel/C9xYz/',
    'https://instagram.com/p/C9xYz',
    'https://www.instagram.com/tv/C9x_Y-z/',
    'https://www.instagram.com/reels/C9xYz/',
    'https://www.instagram.com/tofly.id/reel/C9xYz/',
    'https://m.instagram.com/p/C9xYz/?igsh=MTc4',
    'http://instagram.com/reel/C9xYz#comments',
  ])('takes the Instagram link %s', (link) => {
    expect(checkPlatformLink('instagram', link)).toEqual({ url: link });
  });

  it.each([
    'https://www.tiktok.com/@tofly/video/7312345678901234567',
    'https://tiktok.com/@to.fly_id/video/7312345678901234567/?is_from_webapp=1',
    'https://m.tiktok.com/@tofly/video/7312345678901234567',
    'https://vt.tiktok.com/ZSxyz123/',
    'https://vm.tiktok.com/ZMabc123',
  ])('takes the TikTok link %s', (link) => {
    expect(checkPlatformLink('tiktok', link)).toEqual({ url: link });
  });

  it('trims the link it keeps', () => {
    expect(
      checkPlatformLink('instagram', '  https://www.instagram.com/p/C9xYz/  '),
    ).toEqual({ url: 'https://www.instagram.com/p/C9xYz/' });
  });

  it.each([
    [
      'a TikTok link',
      'https://www.tiktok.com/@tofly/video/7312345678901234567',
    ],
    ['a profile', 'https://www.instagram.com/tofly.id/'],
    ['a story', 'https://www.instagram.com/stories/tofly.id/3312345678/'],
    ['a look-alike host', 'https://instagram.com.evil.example/reel/C9xYz/'],
    ['a host that only ends the same', 'https://notinstagram.com/reel/C9xYz/'],
    ['a script url', 'javascript:alert(1)//instagram.com/reel/C9xYz'],
    ['an ftp url', 'ftp://instagram.com/reel/C9xYz'],
    ['credentials in the url', 'https://admin:pw@instagram.com/reel/C9xYz/'],
    ['another port', 'https://instagram.com:8443/reel/C9xYz/'],
    ['text that is not a url', 'reel C9xYz'],
    ['a post with more path after it', 'https://instagram.com/reel/C9xYz/x/y'],
  ])(
    'refuses %s as an Instagram link, naming the forms it takes',
    (_what, link) => {
      expect(checkPlatformLink('instagram', link)).toEqual({
        error: INSTAGRAM_HINT,
      });
    },
  );

  it.each([
    ['an Instagram link', 'https://www.instagram.com/reel/C9xYz/'],
    ['a profile', 'https://www.tiktok.com/@tofly'],
    [
      'a video without its handle',
      'https://www.tiktok.com/video/7312345678901234567',
    ],
    [
      'a video id that is not a number',
      'https://www.tiktok.com/@tofly/video/abc',
    ],
    ['a short link with more path', 'https://vt.tiktok.com/ZSxyz/extra'],
    ['a short link on another subdomain', 'https://vx.tiktok.com/ZSxyz/'],
    ['a look-alike host', 'https://tiktok.com.evil.example/@tofly/video/1'],
  ])(
    'refuses %s as a TikTok link, naming the forms it takes',
    (_what, link) => {
      expect(checkPlatformLink('tiktok', link)).toEqual({ error: TIKTOK_HINT });
    },
  );

  it('takes a link of exactly the maximum length and refuses one character more', () => {
    const base = 'https://www.instagram.com/p/';
    const exact = base + 'a'.repeat(MAX_LINK_LENGTH - base.length);

    expect(MAX_LINK_LENGTH).toBe(300);
    expect(checkPlatformLink('instagram', exact)).toEqual({ url: exact });
    expect(checkPlatformLink('instagram', `${exact}b`)).toEqual({
      error: 'Link maksimal 300 karakter',
    });
  });

  it.each([undefined, null, '', '   ', 42, ['https://instagram.com/p/a']])(
    'asks for a link when given %j',
    (value) => {
      expect(checkPlatformLink('instagram', value)).toEqual({
        error: 'Link video wajib diisi',
      });
    },
  );
});

describe('LINK_RULES', () => {
  it('has one rule per platform, each naming itself', () => {
    expect(Object.keys(LINK_RULES)).toEqual(['instagram', 'tiktok']);
    expect(LINK_RULES.instagram.label).toBe('Instagram');
    expect(LINK_RULES.tiktok.label).toBe('TikTok');
  });
});

describe('isSocialPlatform', () => {
  it.each([
    ['instagram', true],
    ['tiktok', true],
    ['youtube', false],
    ['Instagram', false],
    ['__proto__', false],
    ['toString', false],
    [undefined, false],
  ])('%j is a platform: %s', (value, expected) => {
    expect(isSocialPlatform(value)).toBe(expected);
  });
});
