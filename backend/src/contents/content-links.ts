import { Prisma, type social_platform } from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';

// A content item's video links (PBI-38): at most one per platform, each video on one content
// only. The rules every reader and writer of content_links shares live here, without a
// database, so they are tested on plain values.

/** Scheme, then the host (with any port) and the path; the query and fragment are left out. */
const LINK_PARTS = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/i;

/**
 * An Instagram post's short code, whether it is linked as a post, a reel, a reels page or a TV
 * page, and with or without its owner's handle in front.
 */
const INSTAGRAM_POST = /^\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/;

/** A TikTok video's id, under any handle or in the old `/v/<id>.html` form. */
const TIKTOK_VIDEO = /^\/(?:@[^/]+\/)?(?:video|v)\/(\d+)/;

/**
 * The key every link to one video shares (PBI-38 AC 5):
 * - an Instagram post or TikTok video is keyed by the id its platform gives it
 *   (`instagram:<short code>`, `tiktok:<video id>`), so `/p/` and `/reel/`, a handle typed in
 *   another case or renamed, and `m.` hosts all meet;
 * - any other link, a short `vm.tiktok.com` link included until it is resolved, is keyed by its
 *   host in lowercase without `www.` and its path without trailing slashes.
 * The scheme, query (`?igsh=`, `utm_*`) and fragment never count; a short code keeps its case,
 * since Instagram's are case-sensitive. A value that is not a URL, kept from before links were
 * checked, is keyed by its lowercase text.
 *
 * The migration's `content_link_key` SQL function is the same rule, and a check constraint
 * holds every stored key to it, so the unique key cannot be dodged by a differently copied link
 * (OWASP A08:2025).
 */
export function normalizeVideoLink(link: string): string {
  const trimmed = link.trim();
  const parts = LINK_PARTS.exec(trimmed);
  if (!parts) {
    return trimmed.toLowerCase();
  }
  const [, host, path] = parts;
  const site = host.toLowerCase().replace(/^www\./, '');
  return videoKey(site, path) ?? site + withoutTrailingSlashes(path);
}

/** Whether `site` is `domain` or one of its subdomains, never a look-alike such as `xdomain`. */
function onDomain(site: string, domain: string): boolean {
  return site === domain || site.endsWith(`.${domain}`);
}

/** The platform's own id for the post or video a link names, read only on that platform. */
function videoKey(site: string, path: string): string | null {
  const post = onDomain(site, 'instagram.com') && INSTAGRAM_POST.exec(path);
  if (post) {
    return `instagram:${post[1]}`;
  }
  const video = onDomain(site, 'tiktok.com') && TIKTOK_VIDEO.exec(path);
  return video ? `tiktok:${video[1]}` : null;
}

/** A scan from the end rather than `/\/+$/`, which backtracks over every slash run it meets. */
function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path[end - 1] === '/') {
    end -= 1;
  }
  return path.slice(0, end);
}

/**
 * The order every read of content_links lists a content's links in: as they were handed in, so
 * the first is the one that set the content's submitted day.
 */
export const LINKS_AS_HANDED_IN: Prisma.content_linksOrderByWithRelationInput[] = [
  { submitted_at: 'asc' },
  { created_at: 'asc' },
];

/**
 * The earliest submitted link: its day is the content's submitted day, which lateness, the Late
 * Submission tag and penalties read (AC 7). Two links of one day keep the order they were read
 * in, which the queries set to the order they were written.
 */
export function firstLink<T extends { submitted_at: Date }>(
  links: readonly T[],
): T | undefined {
  return links.reduce<T | undefined>(
    (first, link) =>
      first === undefined ||
      link.submitted_at.getTime() < first.submitted_at.getTime()
        ? link
        : first,
    undefined,
  );
}

/**
 * The platforms a content has a link for, each once, in the order the app lists platforms. A
 * link kept from before platforms were recorded has none and is left out.
 */
export function linkPlatforms(
  links: readonly { platform: social_platform | null }[],
): social_platform[] {
  return SOCIAL_PLATFORMS.filter((platform) =>
    links.some((link) => link.platform === platform),
  );
}

/** A link refused because the same video is already stored on another content (AC 5). */
export function isLinkTaken(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    String(error.meta?.target).includes('normalized_url')
  );
}
