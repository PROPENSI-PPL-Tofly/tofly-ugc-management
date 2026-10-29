import type { SocialPlatform } from './connect-state.js';

// Why a connect attempt failed (PBI-19, AC 4). The Performa page owns the wording.
export type ConnectError =
  'cancelled' | 'not_professional' | 'not_tester' | 'platform_error';

// A fixed, same-origin path: nothing from the request decides where a connect lands, so the
// callback cannot be turned into an open redirect.
const PERFORMANCE_PATH = '/creator/performance';

function performancePath(params: Record<string, string>): string {
  return `${PERFORMANCE_PATH}?${new URLSearchParams(params).toString()}`;
}

export function connectedPath(platform: SocialPlatform): string {
  return performancePath({ platform, connected: '1' });
}

export function connectErrorPath(
  platform: SocialPlatform,
  error: ConnectError,
): string {
  return performancePath({ platform, error });
}
