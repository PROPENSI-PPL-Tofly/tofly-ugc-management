import {
  checkVideoSubmission,
  detectVideoPlatform,
} from './video-submission.js';

describe('detectVideoPlatform', () => {
  it.each([
    ['https://instagram.com/reel/123', 'instagram'],
    ['https://www.instagram.com/reel/123', 'instagram'],
    ['https://cdn.instagram.com/reel/123', 'instagram'],
    ['https://tiktok.com/@creator/video/123', 'tiktok'],
    ['https://www.tiktok.com/@creator/video/123', 'tiktok'],
    ['https://vm.tiktok.com/abc123', 'tiktok'],
  ] as const)('detects %s as %s', (link, platform) => {
    expect(detectVideoPlatform(link)).toBe(platform);
  });

  it.each([
    'https://www.youtube.com/shorts/123',
    'https://instagram.com.evil.example/reel/123',
    'https://tiktok.com.evil.example/@creator/video/123',
    'javascript:alert(1)',
    'not-a-url',
  ])('rejects unsupported or unsafe video platform %s', (link) => {
    expect(detectVideoPlatform(link)).toBeNull();
  });
});

describe('checkVideoSubmission', () => {
  it('accepts and trims a valid HTTP video link', () => {
    expect(
      checkVideoSubmission({
        videoLink: ' https://www.example.com/video/123 ',
      }),
    ).toEqual({
      videoLink: 'https://www.example.com/video/123',
    });
  });

  it('accepts a valid HTTPS video link', () => {
    expect(
      checkVideoSubmission({
        videoLink: 'https://www.tiktok.com/@creator/video/123',
      }),
    ).toEqual({
      videoLink: 'https://www.tiktok.com/@creator/video/123',
    });
  });

  it.each([
    ['missing field', {}],
    ['empty string', { videoLink: '' }],
    ['whitespace-only string', { videoLink: '   ' }],
    ['non-string value', { videoLink: 123 }],
    ['javascript URL', { videoLink: 'javascript:alert(1)' }],
    ['data URL', { videoLink: 'data:text/html,test' }],
    ['malformed URL', { videoLink: 'not-a-url' }],
  ])('rejects %s', (_label, body) => {
    expect(() => checkVideoSubmission(body)).toThrow();
  });

  it('rejects a video link longer than 2048 characters', () => {
    expect(() =>
      checkVideoSubmission({
        videoLink: `https://example.com/${'a'.repeat(2040)}`,
      }),
    ).toThrow();
  });

  it('rejects null instead of treating it as a valid request object', () => {
    expect(() => checkVideoSubmission(null)).toThrow();
  });

  it('rejects an array instead of treating it as a request object', () => {
    expect(() => checkVideoSubmission([])).toThrow();
  });
});
