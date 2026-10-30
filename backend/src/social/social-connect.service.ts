import { performancePath } from './connect-outcome.js';
import type { OAuthStateSigner, SocialPlatform } from './oauth-state.js';
import {
  logSafeName,
  PlatformRefusal,
  type PlatformAccount,
  type SocialAccountLinker,
  type SocialOAuthProvider,
} from './ports.js';

/** Platform codes are a few hundred characters; anything far longer is not one. */
export const MAX_CODE_LENGTH = 1024;

export interface WarningLog {
  warn(message: string): void;
}

/** The query a platform redirects back with, straight from the request. */
export interface CallbackQuery {
  code?: unknown;
  state?: unknown;
  error?: unknown;
  [other: string]: unknown;
}

function nameOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.name : typeof thrown;
}

/**
 * Connecting a creator's social account (PBI-19): start sends the creator to the platform with
 * a signed state, complete turns the callback into a stored account. Each answer is a path on
 * the Performa page, so the browser is always redirected and never shown an error body.
 *
 * Which platform is a provider (Strategy), what is kept is the linker (19.3), and the state
 * signer is shared; each comes in through the constructor, so tests and Instagram (19.1) plug
 * in without this class changing (Dependency Inversion, Open/Closed).
 */
export class SocialConnectService {
  private readonly providers: ReadonlyMap<SocialPlatform, SocialOAuthProvider>;

  constructor(
    providers: readonly SocialOAuthProvider[],
    private readonly signer: OAuthStateSigner | undefined,
    private readonly linker: SocialAccountLinker,
    private readonly log: WarningLog,
  ) {
    this.providers = new Map(providers.map((p) => [p.platform, p]));
  }

  /** GET /social/:platform/connect: where to send the creator next. */
  async start(creatorId: string, platform: SocialPlatform): Promise<string> {
    const provider = this.configured(platform);
    if (!provider || !this.signer) {
      return performancePath(platform, 'platform_error');
    }
    return provider.authorizationUrl(
      await this.signer.issue(creatorId, platform),
    );
  }

  /** GET /social/:platform/callback: where the creator lands once the connect has ended. */
  async complete(
    creatorId: string,
    platform: SocialPlatform,
    query: CallbackQuery,
  ): Promise<string> {
    const provider = this.configured(platform);
    if (!provider || !this.signer) {
      return performancePath(platform, 'platform_error');
    }

    // The state first: nothing else in the query is trusted until it proves the callback
    // belongs to an attempt this creator started (OWASP A01:2025).
    const check = await this.signer.verify(query.state, creatorId, platform);
    if (!check.ok) {
      return this.rejected(platform, check.reason);
    }

    if (query.error !== undefined) {
      const outcome =
        typeof query.error === 'string'
          ? provider.callbackError(query.error)
          : 'platform_error';
      this.log.warn(
        `${platform} connect ended on the platform: ${logSafeName(query.error)} (${outcome})`,
      );
      return performancePath(platform, outcome);
    }

    const { code } = query;
    if (
      typeof code !== 'string' ||
      code === '' ||
      code.length > MAX_CODE_LENGTH
    ) {
      return this.rejected(platform, 'code missing or malformed');
    }

    let account: PlatformAccount;
    try {
      account = await provider.connect(code);
    } catch (thrown) {
      if (thrown instanceof PlatformRefusal) {
        this.log.warn(`${platform} connect failed: ${thrown.message}`);
        return performancePath(platform, thrown.outcome);
      }
      // Anything else may hold anything, a token included, so only its kind is logged
      // (OWASP A09:2025, A10:2025).
      this.log.warn(
        `${platform} connect failed unexpectedly: ${nameOf(thrown)}`,
      );
      return performancePath(platform, 'platform_error');
    }

    try {
      if ((await this.linker.link(creatorId, account)) === 'taken') {
        this.log.warn(
          `${platform} connect refused: account already connected to another creator`,
        );
        return performancePath(platform, 'account_taken');
      }
    } catch (thrown) {
      this.log.warn(
        `${platform} account could not be stored: ${nameOf(thrown)}`,
      );
      return performancePath(platform, 'platform_error');
    }
    return performancePath(platform, 'connected');
  }

  private configured(
    platform: SocialPlatform,
  ): SocialOAuthProvider | undefined {
    const provider = this.providers.get(platform);
    if (!provider || !this.signer) {
      this.log.warn(`${platform} connect is not configured`);
    }
    return provider;
  }

  private rejected(platform: SocialPlatform, reason: string): string {
    this.log.warn(`${platform} connect callback rejected: ${reason}`);
    return performancePath(platform, 'connect_failed');
  }
}
