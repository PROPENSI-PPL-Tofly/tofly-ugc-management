import { creatorMaySignIn, type SignInContract } from '../auth/google/creator-access.js';

// PBI-11 AC 3: the Paid email of a creator's last invoice says from which day access closes. It
// asks the access rule PBI-30 and PBI-37 share whether anything still keeps access open tomorrow,
// so the email and the sign-in check can never disagree (DRY).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + MS_PER_DAY).toISOString().slice(0, 10);
}

/** Tomorrow (YYYY-MM-DD) when nothing keeps access open after today, else null. */
export function accessClosesAfterPaid(
  today: string,
  contracts: readonly SignInContract[],
): string | null {
  const tomorrow = nextDay(today);
  return creatorMaySignIn(tomorrow, contracts) ? null : tomorrow;
}
