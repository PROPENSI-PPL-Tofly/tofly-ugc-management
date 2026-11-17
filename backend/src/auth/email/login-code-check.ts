import type { LoginCodeRow } from './login-code-store.js';

/** After this many wrong attempts the code is invalid and a new one must be requested. */
export const MAX_CODE_ATTEMPTS = 5;

/** Whether the code can still be tried: unused, unexpired and under the attempt limit. */
export function isLiveLoginCode(row: LoginCodeRow, now: Date): boolean {
  return (
    row.usedAt === null &&
    row.expiresAt.getTime() > now.getTime() &&
    row.attempts < MAX_CODE_ATTEMPTS
  );
}

export function attemptsLeft(attempts: number): number {
  return MAX_CODE_ATTEMPTS - attempts;
}
