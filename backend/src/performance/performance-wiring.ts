import { Logger } from '@nestjs/common';
import {
  PrismaSocialTokenStore,
  type SocialTokenRows,
} from '../social/social-token-store.js';
import { tiktokConfig } from '../social/tiktok/tiktok-config.js';
import { TikTokProvider } from '../social/tiktok/tiktok-provider.js';
import { TokenCipher } from '../social/token-cipher.js';
import type { PerformanceSource } from './performance-source.js';
import { TikTokPerformanceSource } from './tiktok/tiktok-performance-source.js';

type Env = Record<string, string | undefined>;

/**
 * The performance sources this environment can read (PBI-27), for the sync (27.4) to take by
 * platform. As with the connect (19.2): a setting left unset switches its source off, and one
 * set wrongly, such as a token key that is not 32 bytes, fails the boot. Without the token key
 * no stored token opens, so no platform is offered. Instagram (27.2) joins as one more entry.
 */
export function performanceSources(
  env: Env,
  rows: SocialTokenRows,
): PerformanceSource[] {
  const tokenKey = env.SOCIAL_TOKEN_KEY?.trim() ?? '';
  if (!tokenKey) {
    return [];
  }
  const tokens = new PrismaSocialTokenStore(rows, new TokenCipher(tokenKey));

  const tiktok = tiktokConfig(env);
  return tiktok
    ? [
        new TikTokPerformanceSource(
          tokens,
          new TikTokProvider(tiktok),
          new Logger('TikTokPerformance'),
        ),
      ]
    : [];
}
