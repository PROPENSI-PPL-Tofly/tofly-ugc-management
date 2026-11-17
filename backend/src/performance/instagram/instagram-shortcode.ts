// The kinds of Instagram link whose next path segment is a media's shortcode (PRD PBI-27).
const MEDIA_KINDS = new Set(['p', 'reel', 'reels', 'tv']);

// Shortcodes are letters, digits, '-' and '_', and are case-sensitive.
const SHORTCODE = /^[A-Za-z0-9_-]+$/;

function isInstagramHost(host: string): boolean {
  return host === 'instagram.com' || host.endsWith('.instagram.com');
}

// The shortcode of the video an Instagram link points at, or null when the link is not one, so
// it can be matched against the connected account's media list (PBI-27, AC 10).
export function instagramShortcode(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (!isInstagramHost(url.hostname)) {
    return null;
  }

  // /reel/<code>/, or /<handle>/reel/<code>/ as Instagram's share sheet sometimes writes it.
  const segments = url.pathname.split('/').filter(Boolean);
  const kind = segments.findIndex((segment) => MEDIA_KINDS.has(segment));
  const code = kind === 0 || kind === 1 ? segments[kind + 1] : undefined;
  return code !== undefined && SHORTCODE.test(code) ? code : null;
}
