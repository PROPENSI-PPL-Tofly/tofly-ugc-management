export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_SESSION_ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1000;

export interface SessionConfig {
  idleTimeoutMs: number;
  absoluteLifetimeMs: number;
  now?: () => Date;
}

function duration(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer number of milliseconds`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive integer number of milliseconds`);
  }
  return parsed;
}

/** Session timeouts are explicit deployment settings with approved defaults. */
export function sessionConfig(
  env: Record<string, string | undefined>,
): SessionConfig {
  const idleTimeoutMs = duration(
    env,
    'SESSION_IDLE_TIMEOUT_MS',
    DEFAULT_SESSION_IDLE_TIMEOUT_MS,
  );
  const absoluteLifetimeMs = duration(
    env,
    'SESSION_ABSOLUTE_LIFETIME_MS',
    DEFAULT_SESSION_ABSOLUTE_LIFETIME_MS,
  );
  if (idleTimeoutMs > absoluteLifetimeMs) {
    throw new Error(
      'SESSION_IDLE_TIMEOUT_MS cannot exceed SESSION_ABSOLUTE_LIFETIME_MS',
    );
  }
  return { idleTimeoutMs, absoluteLifetimeMs };
}
