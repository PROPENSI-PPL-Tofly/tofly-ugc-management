// The Instagram app (Instagram API with Instagram Login) and the secret that signs the connect
// state. Both come only from the server's environment, so the app secret is never in the repo
// (PBI-19, 19.1). Each environment sets its own redirect URI, registered on the Meta app.

type Env = Record<string, string | undefined>;

// HMAC-SHA256 keys shorter than this are guessable; refuse to sign with one.
export const MIN_STATE_SECRET_LENGTH = 32;

export interface InstagramConfig {
  appId: string;
  appSecret: string;
  // Must match one registered on the Meta app exactly.
  redirectUri: string;
  stateSecret: string;
}

function value(env: Env, name: string): string {
  return env[name]?.trim() ?? '';
}

// The Instagram app from the environment, or undefined while any part of it is missing.
export function instagramConfig(env: Env): InstagramConfig | undefined {
  const appId = value(env, 'INSTAGRAM_APP_ID');
  const appSecret = value(env, 'INSTAGRAM_APP_SECRET');
  const redirectUri = value(env, 'INSTAGRAM_REDIRECT_URI');
  const stateSecret = value(env, 'SOCIAL_STATE_SECRET');
  if (
    !appId ||
    !appSecret ||
    !redirectUri ||
    stateSecret.length < MIN_STATE_SECRET_LENGTH
  ) {
    return undefined;
  }
  return { appId, appSecret, redirectUri, stateSecret };
}
