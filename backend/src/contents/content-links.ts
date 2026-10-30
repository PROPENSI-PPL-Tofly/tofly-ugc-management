import { Prisma, type social_platform } from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';

// A content item's video links (PBI-38): at most one per platform, each video on one content
// only. The rules every reader and writer of content_links shares live here, without a
// database, so they are tested on plain values.

/** Scheme, then the host (with any port) and the path; the query and fragment are left out. */
const LINK_PARTS = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/i;

/**
 * The key two copies of one video's link share: host in lowercase without `www.`, then the path
 * without trailing slashes. The scheme, query (`?igsh=`, `utm_*`) and fragment are dropped; the
 * path keeps its case, since Instagram and TikTok short codes are case-sensitive. A value that
 * is not a URL, kept from before links were checked, is keyed by its lowercase text.
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
  return host.toLowerCase().replace(/^www\./, '') + withoutTrailingSlashes(path);
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
