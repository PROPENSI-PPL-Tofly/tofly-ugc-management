import {
  PlatformRefusal,
  type ConnectError,
  type PlatformAccount,
  type SocialOAuthProvider,
} from '../ports.js';
import { instagramAuthorizationUrl } from './instagram-authorization.js';
import {
  InstagramApiError,
  InstagramClient,
  type InstagramAccount,
} from './instagram-client.js';
import type { InstagramConfig } from './instagram-config.js';

// Instagram API with Instagram Login only serves Professional accounts (PRD 3.1, AC 4).
const PROFESSIONAL = new Set(['BUSINESS', 'MEDIA_CREATOR']);

// Instagram ends the redirect with '#_'; a browser drops it, a pasted address may not.
function withoutFragment(code: string): string {
  return code.endsWith('#_') ? code.slice(0, -2) : code;
}

// Instagram (PBI-19, 19.1) as the second SocialOAuthProvider beside TikTok, so its connect goes
// through the same signed state, callback checks and encrypted storage (Strategy, review #126).
export class InstagramProvider implements SocialOAuthProvider {
  readonly platform = 'instagram' as const;

  constructor(
    private readonly config: Pick<
      InstagramConfig,
      'appId' | 'appSecret' | 'redirectUri'
    >,
    private readonly client: Pick<InstagramClient, 'connect'> =
      new InstagramClient(config),
  ) {}

  authorizationUrl(state: string): string {
    return instagramAuthorizationUrl(this.config, state);
  }

  callbackError(error: string): ConnectError {
    return error === 'access_denied' ? 'cancelled' : 'platform_error';
  }

  async connect(code: string): Promise<PlatformAccount> {
    let account: InstagramAccount;
    try {
      account = await this.client.connect(withoutFragment(code));
    } catch (error) {
      // Instagram's own failures keep their code; anything else goes on as it is.
      if (error instanceof InstagramApiError) {
        throw new PlatformRefusal(error.failure, error.message);
      }
      throw error;
    }

    if (!PROFESSIONAL.has(account.accountType)) {
      throw new PlatformRefusal(
        'not_professional',
        `account type ${account.accountType} is not Professional`,
      );
    }

    return {
      platform: 'instagram',
      platformUserId: account.platformUserId,
      username: account.username,
      accessToken: account.accessToken,
      accessTokenExpiresAt: account.expiresAt,
      // Instagram has none; its long-lived token is refreshed with itself.
      refreshToken: null,
      refreshTokenExpiresAt: null,
    };
  }
}
