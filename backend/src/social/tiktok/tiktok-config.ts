type Env = Record<string, string | undefined>;

/** The TikTok app (Login Kit, sandbox mode) as the environment configures it. */
export interface TikTokConfig {
  clientKey: string;
  /** Server config only (Secret Manager in deployed environments); never in the repo. */
  clientSecret: string;
  /** Registered on the TikTok app for this environment. */
  redirectUri: string;
}

const REQUIRED = [
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'TIKTOK_REDIRECT_URI',
] as const;

/**
 * TikTok redirects only to an absolute https URI with no query or fragment (Login Kit for
 * Web), and a plain-http callback would carry the authorization code in the clear.
 */
function isUsableRedirect(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.search === '' && url.hash === '';
}

/** The TikTok app from the environment, or undefined while any part is missing or unusable. */
export function tiktokConfig(env: Env): TikTokConfig | undefined {
  const [clientKey, clientSecret, redirectUri] = REQUIRED.map(
    (name) => env[name]?.trim() ?? '',
  );
  if (!clientKey || !clientSecret || !isUsableRedirect(redirectUri)) {
    return undefined;
  }
  return { clientKey, clientSecret, redirectUri };
}
