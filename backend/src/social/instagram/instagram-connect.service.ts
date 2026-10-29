import type { WarningLog } from '../../auth/google/google-sign-in.service.js';
import {
  connectedPath,
  connectErrorPath,
  type ConnectError,
} from '../connect-redirects.js';
import type { SocialAccountStore } from '../ports.js';
import {
  InstagramApiError,
  type InstagramAccount,
} from './instagram-client.js';

// Instagram API with Instagram Login only serves Professional accounts (PRD 3.1, AC 4).
const PROFESSIONAL = new Set(['BUSINESS', 'MEDIA_CREATOR']);

// The callback's use case, after the state has been checked: ask Instagram who the account is,
// keep it only if it is Professional, and hand it to storage. Every outcome is a path back to
// Performa; every failure is logged by step, never with the code or a token.
export class InstagramConnectService {
  constructor(
    private readonly client: {
      connect(code: string): Promise<InstagramAccount>;
    },
    private readonly store: SocialAccountStore,
    private readonly log: WarningLog,
  ) {}

  async complete(creatorId: string, code: string): Promise<string> {
    let account: InstagramAccount;
    try {
      account = await this.client.connect(code);
    } catch (error) {
      return this.failed(
        error instanceof InstagramApiError ? error.failure : 'platform_error',
        error instanceof InstagramApiError
          ? error.message
          : 'unexpected error while reading the account',
      );
    }

    if (!PROFESSIONAL.has(account.accountType)) {
      return this.failed(
        'not_professional',
        `account type ${account.accountType} is not Professional`,
      );
    }

    try {
      await this.store.save({
        creatorId,
        platform: 'instagram',
        platformUserId: account.platformUserId,
        username: account.username,
        accessToken: account.accessToken,
        refreshToken: null,
        tokenExpiresAt: account.expiresAt,
      });
    } catch {
      // Storage's own message is not logged: it may quote the row it failed to write.
      return this.failed('platform_error', 'the account could not be saved');
    }
    return connectedPath('instagram');
  }

  private failed(error: ConnectError, reason: string): string {
    this.log.warn(`Instagram connect failed (${error}): ${reason}`);
    return connectErrorPath('instagram', error);
  }
}
