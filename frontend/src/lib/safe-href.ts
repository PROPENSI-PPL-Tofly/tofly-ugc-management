// Links that creators type in (draft files, published videos) end up in an admin's <a href>.
// React escapes text but not a URL's scheme, so a "javascript:" link would run in the admin's
// session the moment it is clicked (OWASP A03). Only absolute web addresses are let through;
// the caller shows anything else as plain text.

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

/** The link, trimmed, when it is an absolute http(s) address; null otherwise. */
export function safeHref(link: string): string | null {
  const trimmed = link.trim();

  // No base URL on purpose: a relative or scheme-less link fails to parse instead of
  // resolving against this app and sending the admin to one of our own pages.
  // try/catch rather than URL.canParse, which Safari only gained in version 17.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // The parser drops tabs and newlines and lowercases the scheme, so "java\nscript:" and
  // "JavaScript:" are read here exactly as a browser would read them.
  return WEB_PROTOCOLS.has(url.protocol) ? trimmed : null;
}
