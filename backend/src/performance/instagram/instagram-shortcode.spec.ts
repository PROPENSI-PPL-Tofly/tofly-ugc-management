import { instagramShortcode } from './instagram-shortcode.js';

describe('instagramShortcode', () => {
  it.each([
    ['https://www.instagram.com/p/DAbC123xyz/', 'DAbC123xyz'],
    ['https://www.instagram.com/reel/DAbC123xyz/', 'DAbC123xyz'],
    ['https://www.instagram.com/reels/DAbC123xyz/', 'DAbC123xyz'],
    ['https://www.instagram.com/tv/DAbC123xyz/', 'DAbC123xyz'],
    ['https://instagram.com/reel/DAbC123xyz', 'DAbC123xyz'],
    ['http://m.instagram.com/reel/DAbC123xyz/', 'DAbC123xyz'],
    ['https://www.instagram.com/reel/DAbC123xyz/?igsh=MWQ1ZGU', 'DAbC123xyz'],
    ['https://www.instagram.com/reel/DAbC-12_xyz/#comments', 'DAbC-12_xyz'],
    // Instagram's share sheet sometimes puts the handle first.
    ['https://www.instagram.com/rangga.creates/reel/DAbC123xyz/', 'DAbC123xyz'],
    ['  https://www.instagram.com/reel/DAbC123xyz/  ', 'DAbC123xyz'],
  ])('reads the shortcode from %s', (url, shortcode) => {
    expect(instagramShortcode(url)).toBe(shortcode);
  });

  // Shortcodes are case-sensitive: DAbC and dabc are two different videos.
  it('keeps the case of the shortcode', () => {
    expect(instagramShortcode('https://www.INSTAGRAM.com/reel/AbCd/')).toBe(
      'AbCd',
    );
  });

  it.each([
    [
      'a TikTok link',
      'https://www.tiktok.com/@rangga/video/7432100000000000000',
    ],
    ['a profile', 'https://www.instagram.com/rangga.creates/'],
    ['a story', 'https://www.instagram.com/stories/rangga.creates/3456/'],
    ['a post kind with no code', 'https://www.instagram.com/reel/'],
    [
      'a host that only ends like Instagram',
      'https://notinstagram.com/reel/AbCd/',
    ],
    [
      'a host that only starts like Instagram',
      'https://instagram.com.evil.example/reel/AbCd/',
    ],
    ['text that is not a link', 'reel DAbC123xyz'],
    ['an empty value', ''],
  ])('finds none in %s', (_what, url) => {
    expect(instagramShortcode(url)).toBeNull();
  });
});
