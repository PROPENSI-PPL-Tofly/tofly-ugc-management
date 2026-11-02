import { NotFoundException } from '@nestjs/common';
import { SocialPlatformPipe } from './social-platform.pipe.js';

describe('SocialPlatformPipe', () => {
  const pipe = new SocialPlatformPipe();

  it.each(['tiktok', 'instagram'])('lets %s through', (platform) => {
    expect(pipe.transform(platform)).toBe(platform);
  });

  // A route for any other value would not exist, so it answers as one that does not.
  it.each([
    ['another platform', 'facebook'],
    ['another case', 'TikTok'],
    ['an empty segment', ''],
    ['an inherited key', '__proto__'],
    ['a padded name', ' tiktok'],
  ])('answers 404 for %s', (_label, value) => {
    expect(() => pipe.transform(value)).toThrow(NotFoundException);
  });
});
