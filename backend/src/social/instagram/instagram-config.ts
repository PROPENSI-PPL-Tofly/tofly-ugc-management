// The Instagram app (Instagram API with Instagram Login), only from the server's environment,
// so the app secret is never in the repo (PBI-19, 19.1). Each environment sets its own redirect
// URI, registered on the Meta app. The connect state is signed by the shared OAuthStateSigner.

type Env = Record<string, string | undefined>;

export interface InstagramConfig {
  appId: string;
  appSecret: string;
  // Must match one registered on the Meta app exactly.
  redirectUri: string;
}

function value(env: Env, name: string): string {
  return env[name]?.trim() ?? '';
}

// The Instagram app from the environment, or undefined while any part of it is missing.
export function instagramConfig(env: Env): InstagramConfig | undefined {
  const appId = value(env, 'INSTAGRAM_APP_ID');
  const appSecret = value(env, 'INSTAGRAM_APP_SECRET');
  const redirectUri = value(env, 'INSTAGRAM_REDIRECT_URI');
  if (!appId || !appSecret || !redirectUri) {
    return undefined;
  }
  return { appId, appSecret, redirectUri };
}
