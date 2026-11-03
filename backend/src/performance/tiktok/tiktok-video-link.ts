import { normalizeVideoLink } from '../../contents/content-links.js';

// Which TikTok video a submitted link names (PBI-27, 27.3). A full link names it outright; a
// share link (vt.tiktok.com/…) has to be followed to the video it stands for (AC: "short link
// di-resolve dulu, lalu video ID dibaca dari link").

/** Hops a share link may take before it reaches a video; TikTok's take one or two. */
export const MAX_REDIRECTS = 3;

/** The hosts TikTok issues share links on, the same pair the link rules accept (38.2). */
const SHORT_HOSTS = new Set(['vt.tiktok.com', 'vm.tiktok.com']);

/** A share code on TikTok's main site, where some share links pass on their way. */
const SHARE_PATH = /^\/t\/\w+\/?$/;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const VIDEO_KEY = 'tiktok:';

/**
 * A share link could not be followed right now (TikTok unreachable, too slow, or failing). It
 * says nothing about the video, so the link is tried again on the next run.
 */
export class TikTokLinkUnreachable extends Error {
  override readonly name = 'TikTokLinkUnreachable';
}

/** The video id the link itself names, by the same rule as the link's unique key (38.1). */
function namedVideo(link: string): string | null {
  const key = normalizeVideoLink(link);
  return key.startsWith(VIDEO_KEY) ? key.slice(VIDEO_KEY.length) : null;
}

/** A URL, or null for text that is not one. */
function parse(link: string, base?: URL): URL | null {
  try {
    return new URL(link, base);
  } catch {
    return null;
  }
}

/**
 * Whether a hop may be fetched: a share link (on a share host, or a /t/ code on TikTok's own
 * domain) over https with no credentials or port. Anything else, another host above all, is
 * never fetched, so a redirect cannot send the server elsewhere (OWASP A01:2025, SSRF).
 */
function isShareHop(url: URL): boolean {
  const onTikTok =
    url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com');
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    (SHORT_HOSTS.has(url.hostname) ||
      (onTikTok && SHARE_PATH.test(url.pathname)))
  );
}

/**
 * The id of the TikTok video `link` names, or null when it names none: not a TikTok video, a
 * share link that leads nowhere or off TikTok, or one that takes more than MAX_REDIRECTS hops.
 * A share link is followed one hop at a time, each checked before it is fetched, all under the
 * caller's deadline. Rejects with TikTokLinkUnreachable when TikTok cannot answer now.
 */
export async function tiktokVideoId(
  link: string,
  fetchImpl: typeof fetch,
  deadline: AbortSignal,
): Promise<string | null> {
  const named = namedVideo(link);
  if (named !== null) {
    return named;
  }
  const start = parse(link.trim());
  if (
    start === null ||
    !SHORT_HOSTS.has(start.hostname) ||
    !isShareHop(start)
  ) {
    return null;
  }

  let hop: URL = start;
  for (let hops = 0; hops < MAX_REDIRECTS; hops += 1) {
    const location = await redirectOf(hop, fetchImpl, deadline);
    const next: URL | null = location === null ? null : parse(location, hop);
    if (next === null) {
      return null;
    }
    const video = namedVideo(next.href);
    if (video !== null) {
      return video;
    }
    if (!isShareHop(next)) {
      return null;
    }
    hop = next;
  }
  return null;
}

/** Where one hop redirects to, or null when it does not redirect. */
async function redirectOf(
  hop: URL,
  fetchImpl: typeof fetch,
  deadline: AbortSignal,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(hop.href, {
      method: 'GET',
      redirect: 'manual',
      signal: deadline,
    });
  } catch {
    throw new TikTokLinkUnreachable('short link unreachable');
  }
  // Only the status and the location are read; the body is never needed.
  await response.body?.cancel();
  if (REDIRECTS.has(response.status)) {
    return response.headers.get('location');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new TikTokLinkUnreachable(`short link answered ${response.status}`);
  }
  return null;
}
