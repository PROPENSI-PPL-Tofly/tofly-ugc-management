import {
  canSubmitDraft,
  canSubmitVideo,
  type ContentStatus,
  daysUntil,
  detectPlatform,
  graceCutoff,
  isInGracePeriod,
} from './task-rules.js';

const TODAY = new Date('2026-09-17T09:30:00.000Z');

function day(offset: number): Date {
  const date = new Date('2026-09-17T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

describe('daysUntil', () => {
  it('counts whole calendar days regardless of the time of day', () => {
    expect(daysUntil(day(0), TODAY)).toBe(0);
    expect(daysUntil(day(1), TODAY)).toBe(1);
    expect(daysUntil(day(10), TODAY)).toBe(10);
  });

  it('goes negative once the deadline has passed', () => {
    expect(daysUntil(day(-3), TODAY)).toBe(-3);
  });
});

describe('canSubmitDraft', () => {
  it.each<[ContentStatus, boolean]>([
    ['scheduled', true],
    ['draft_revision', true],
    ['draft_review', false],
    ['draft_revised', false],
    ['draft_approved', false],
    ['link_submitted', false],
  ])('%s → %s', (status, expected) => {
    expect(canSubmitDraft(status)).toBe(expected);
  });
});

describe('isInGracePeriod', () => {
  it('is closed two days out', () => {
    expect(isInGracePeriod(day(2), TODAY)).toBe(false);
  });

  it('opens at H-1', () => {
    expect(isInGracePeriod(day(1), TODAY)).toBe(true);
  });

  it('stays open on the deadline and after it', () => {
    expect(isInGracePeriod(day(0), TODAY)).toBe(true);
    expect(isInGracePeriod(day(-5), TODAY)).toBe(true);
  });
});

describe('canSubmitVideo', () => {
  it('allows an approved draft whatever the deadline', () => {
    expect(canSubmitVideo('draft_approved', day(30), TODAY)).toBe(true);
  });

  it.each<ContentStatus>([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_revised',
  ])('refuses %s before H-1', (status) => {
    expect(canSubmitVideo(status, day(2), TODAY)).toBe(false);
  });

  it.each<ContentStatus>([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_revised',
  ])(
    'lets %s through inside the grace window without an approved draft',
    (status) => {
      expect(canSubmitVideo(status, day(1), TODAY)).toBe(true);
    },
  );

  it('never accepts a second link for content already submitted', () => {
    expect(canSubmitVideo('link_submitted', day(0), TODAY)).toBe(false);
    expect(canSubmitVideo('link_submitted', day(30), TODAY)).toBe(false);
  });
});

describe('graceCutoff', () => {
  it('is tomorrow at midnight: the last deadline H-1 still covers', () => {
    expect(graceCutoff(TODAY).toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });
});

describe('detectPlatform', () => {
  it.each([
    ['https://www.instagram.com/reel/C8abc/', 'instagram'],
    ['https://instagram.com/p/xyz', 'instagram'],
    ['http://m.instagram.com/reel/1', 'instagram'],
    ['https://WWW.INSTAGRAM.COM/reel/1', 'instagram'],
    ['https://www.tiktok.com/@tofly.id/video/7412345678901234567', 'tiktok'],
    ['https://vm.tiktok.com/ZSabc123/', 'tiktok'],
    ['https://tiktok.com/@a/video/1', 'tiktok'],
  ])('reads %s as %s', (link, platform) => {
    expect(detectPlatform(link)).toBe(platform);
  });

  it.each([
    'https://youtube.com/shorts/abc',
    'https://instagram.com.evil.example/reel/1',
    'https://notinstagram.com/reel/1',
    'https://fakeinstagram.com/reel/1',
    'https://example.com/?next=instagram.com',
    'ftp://instagram.com/reel/1',
    'javascript://instagram.com/%0Aalert(1)',
    'instagram.com/reel/1',
    'bukan link',
    '',
  ])('refuses %s', (link) => {
    expect(detectPlatform(link)).toBeNull();
  });
});
