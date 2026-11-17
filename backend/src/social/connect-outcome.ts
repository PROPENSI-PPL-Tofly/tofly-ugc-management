import type { SocialPlatform } from './oauth-state.js';
import type { ConnectError } from './ports.js';

/** The creator's Performa page (19.4), where the Akun Terhubung panel shows the result. */
export const PERFORMANCE_PAGE = '/creator/performance';

export type ConnectOutcome = 'connected' | ConnectError;

/**
 * Where a connect lands. Built only from closed sets (the platform and the outcome), so it is
 * always this site's own page and the callback cannot be made an open redirect.
 */
export function performancePath(
  platform: SocialPlatform,
  outcome: ConnectOutcome,
): string {
  const query =
    outcome === 'connected'
      ? new URLSearchParams({ connected: platform })
      : new URLSearchParams({ platform, error: outcome });
  return `${PERFORMANCE_PAGE}?${query.toString()}`;
}
