import type { social_platform } from '@prisma/client';

// What a video link on each platform may look like (PBI-38 AC 3). Each platform is one rule
// object behind the same interface (Strategy), so the request check, the submit and the replace
// ask "is this a link to a post on <platform>?" without knowing any host or path, and a new
// platform is one more rule here.

export const MAX_LINK_LENGTH = 300;

const WEB_PROTOCOLS = new Set(['http:', 'https:']);

export interface PlatformLinkRule {
  readonly platform: social_platform;
  /** The platform as the UI names it, for messages. */
  readonly label: string;
  /** The message a refused link gets: which forms the platform takes. */
  readonly hint: string;
  /** Whether a parsed web URL is a post or video of this platform. */
  matches(url: URL): boolean;
}

/** Whether `host` is `domain` or one of its subdomains, never a look-alike such as `xdomain`. */
function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** A post, reel or TV video, with or without the owner's handle in front. */
const INSTAGRAM_POST = /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/[\w-]+\/?$/;

/** A video under its owner's handle. */
const TIKTOK_VIDEO = /^\/@[\w.-]+\/video\/\d+\/?$/;

/** A share link's code, which TikTok resolves to the video. */
const TIKTOK_SHORT_CODE = /^\/\w+\/?$/;

const TIKTOK_SHORT_HOSTS = new Set(['vt.tiktok.com', 'vm.tiktok.com']);

const instagramRule: PlatformLinkRule = {
  platform: 'instagram',
  label: 'Instagram',
  hint: 'Link harus dari Instagram (instagram.com/reel/... atau /p/...)',
  matches: (url) =>
    onDomain(url.hostname, 'instagram.com') &&
    INSTAGRAM_POST.test(url.pathname),
};

const tiktokRule: PlatformLinkRule = {
  platform: 'tiktok',
  label: 'TikTok',
  hint: 'Link harus dari TikTok (tiktok.com/@user/video/... atau vt.tiktok.com/...)',
  matches: (url) =>
    TIKTOK_SHORT_HOSTS.has(url.hostname)
      ? TIKTOK_SHORT_CODE.test(url.pathname)
      : onDomain(url.hostname, 'tiktok.com') && TIKTOK_VIDEO.test(url.pathname),
};

export const LINK_RULES: Readonly<Record<social_platform, PlatformLinkRule>> = {
  instagram: instagramRule,
  tiktok: tiktokRule,
};

/** Narrows an outside value (a route param, a body key) to a platform the app knows. */
export function isSocialPlatform(value: unknown): value is social_platform {
  return typeof value === 'string' && Object.hasOwn(LINK_RULES, value);
}

/**
 * A plain web URL: http(s), no credentials and no port of its own. `URL` lower-cases the host,
 * so the rules compare hosts exactly.
 */
function webUrl(link: string): URL | null {
  if (!URL.canParse(link)) {
    return null;
  }
  const url = new URL(link);
  const plain =
    WEB_PROTOCOLS.has(url.protocol) &&
    url.username === '' &&
    url.password === '' &&
    url.port === '';
  return plain ? url : null;
}

/**
 * One platform's link field, as the submit and the replace take it: the trimmed link, or the
 * message that field shows (AC 3). Only a link the platform's rule accepts reaches the database,
 * so a script URL or another site's link is never stored or opened from the panel (OWASP A03).
 */
export function checkPlatformLink(
  platform: social_platform,
  value: unknown,
): { url: string } | { error: string } {
  const link = typeof value === 'string' ? value.trim() : '';
  if (link === '') {
    return { error: 'Link video wajib diisi' };
  }
  if (link.length > MAX_LINK_LENGTH) {
    return { error: `Link maksimal ${MAX_LINK_LENGTH} karakter` };
  }
  const rule = LINK_RULES[platform];
  const url = webUrl(link);
  return url && rule.matches(url) ? { url: link } : { error: rule.hint };
}
