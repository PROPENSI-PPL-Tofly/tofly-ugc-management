import { OAuthStateSigner } from './oauth-state.js';
import type { SocialAccountLinker, SocialOAuthProvider } from './ports.js';
import {
  PrismaSocialAccountLinker,
  type SocialAccountRows,
} from './prisma-social-account-linker.js';
import { TokenCipher } from './token-cipher.js';
import { tiktokConfig } from './tiktok/tiktok-config.js';
import { TikTokProvider } from './tiktok/tiktok-provider.js';

type Env = Record<string, string | undefined>;

/** Storing an account was asked for while no token key is configured. */
export class SocialStoreNotConfigured extends Error {
  override readonly name = 'SocialStoreNotConfigured';

  constructor() {
    super('SOCIAL_TOKEN_KEY is not set');
  }
}

/** What the connect flow is built from in this environment. */
export interface SocialWiring {
  providers: SocialOAuthProvider[];
  signer: OAuthStateSigner | undefined;
  linker: SocialAccountLinker;
}

function setting(env: Env, name: string): string {
  return env[name]?.trim() ?? '';
}

/**
 * The social connect pieces from server config. A piece left unset switches its part off (the
 * Performa page then shows a platform error); a piece set wrongly, such as a short secret,
 * fails the boot, because it is a mistake rather than a choice.
 *
 * Without the token key no platform is offered at all: a creator would otherwise log in and
 * consent only to have nothing stored, and a token is never stored in the clear.
 */
export function socialWiring(env: Env, rows: SocialAccountRows): SocialWiring {
  const stateSecret = setting(env, 'SOCIAL_STATE_SECRET');
  const signer = stateSecret ? new OAuthStateSigner(stateSecret) : undefined;

  const tokenKey = setting(env, 'SOCIAL_TOKEN_KEY');
  if (!tokenKey) {
    return {
      providers: [],
      signer,
      linker: { link: () => Promise.reject(new SocialStoreNotConfigured()) },
    };
  }

  const tiktok = tiktokConfig(env);
  return {
    providers: tiktok ? [new TikTokProvider(tiktok)] : [],
    signer,
    linker: new PrismaSocialAccountLinker(rows, new TokenCipher(tokenKey)),
  };
}
