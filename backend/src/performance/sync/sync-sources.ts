import type { PrismaService } from '../../prisma/prisma.service.js';
import { TokenCipher } from '../../social/token-cipher.js';
import { InstagramPerformanceSource } from '../instagram/instagram-performance-source.js';
import { PrismaInstagramAccounts } from '../instagram/prisma-instagram-accounts.js';
import { performanceSources } from '../performance-wiring.js';
import type { PerformanceSource } from '../ports.js';

type Env = Record<string, string | undefined>;

/**
 * Every platform the sync can read here (PBI-27, AC 4): the shared wiring's sources, plus the
 * Instagram adapter (27.2) while that wiring does not offer it yet. Instagram needs only the token
 * key, so it is read wherever stored tokens can be opened. One more platform is one more entry,
 * with no change to the sync (Open/Closed).
 */
export function syncSources(
  env: Env,
  rows: Pick<PrismaService, 'social_accounts'>,
): PerformanceSource[] {
  // Fails the boot on a token key set wrongly, as the connect does (19.2).
  const sources = performanceSources(env, rows);
  const tokenKey = env.SOCIAL_TOKEN_KEY?.trim() ?? '';
  if (tokenKey && !sources.some((source) => source.platform === 'instagram')) {
    sources.push(
      new InstagramPerformanceSource(
        new PrismaInstagramAccounts(rows, new TokenCipher(tokenKey)),
      ),
    );
  }
  return sources;
}
