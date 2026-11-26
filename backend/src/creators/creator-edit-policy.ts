// What "Ubah Data" may change on a creator today (PBI-16), judged against what is stored. One
// source: GET /creators/:id answers these same locks for the form to draw, and PATCH refuses by
// them, so a field the form shows as editable is never one the server refuses. Pure, no Prisma
// client and no clock of its own. The fixed rate's lock is the invoice's (InvoiceState).
import { ConflictException } from '@nestjs/common';
import type { social_platform } from '@prisma/client';
import { connectionOf, type ConnectionRow } from '../social/social-connection.js';
import { jakartaMidnight, readableDay } from './evergreen.js';

/** Why a username is read-only; null while the admin may change it. */
export type UsernameLock = 'connected' | 'link_submitted' | null;

export type UsernameLocks = Record<social_platform, UsernameLock>;

/**
 * PBI-16 AC 7: read-only once the creator connected an account on the platform, or submitted a
 * link there: the link is judged against that account, so its name may no longer drift.
 */
export function usernameLock(
  account: ConnectionRow | undefined,
  hasSubmittedLink: boolean,
): UsernameLock {
  if (account && connectionOf(account).connected) return 'connected';
  return hasSubmittedLink ? 'link_submitted' : null;
}

const PLATFORM_LABELS: Record<social_platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const LOCK_REASONS: Record<Exclude<UsernameLock, null>, string> = {
  connected: 'mengikuti akun yang terhubung',
  link_submitted: 'tidak bisa diubah karena sudah ada link konten yang dikirim',
};

export function assertUsernameEditable(lock: UsernameLock, platform: social_platform): void {
  if (lock === null) return;
  throw new ConflictException({
    code: 'USERNAME_LOCKED',
    message: `Username ${PLATFORM_LABELS[platform]} ${LOCK_REASONS[lock]}`,
  });
}

/** A contract period as these rules read it, in the table's columns. */
export interface PolicyPeriod {
  start_date: Date;
  end_date: Date;
  /** Set once the period was ended early (PBI-37). */
  original_end_date: Date | null;
}

/**
 * The end date and the quota change on an active period only. One ended early keeps the end its
 * confirmation agreed on, even while it still runs.
 */
export function assertActivePeriod(period: PolicyPeriod, now: Date): void {
  const today = jakartaMidnight(now).getTime();
  const runs = period.start_date.getTime() <= today && today <= period.end_date.getTime();
  if (runs && period.original_end_date === null) return;
  throw new ConflictException({
    code: 'PERIOD_NOT_ACTIVE',
    message: 'Akhir kontrak dan jumlah konten hanya bisa diubah selama periode aktif',
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function readable(date: Date): string {
  return readableDay(date.toISOString().slice(0, 10));
}

/**
 * Why a new end is refused: it must be later than the end now, and leave the next period its
 * first day. `periods` are all of the creator's, this one included, in any order.
 */
export function contractEndProblem(
  end: Date,
  period: PolicyPeriod,
  periods: readonly PolicyPeriod[],
): string | undefined {
  if (end.getTime() <= period.end_date.getTime()) {
    return `Akhir kontrak hanya bisa dimundurkan dari ${readable(period.end_date)}`;
  }
  const inOrder = [...periods].sort((a, b) => a.start_date.getTime() - b.start_date.getTime());
  const next = inOrder.findIndex(
    (other) => other.start_date.getTime() > period.start_date.getTime(),
  );
  if (next === -1 || end.getTime() < inOrder[next].start_date.getTime()) return undefined;

  const lastDay = new Date(inOrder[next].start_date.getTime() - MS_PER_DAY);
  return `Paling lambat ${readable(lastDay)}, sehari sebelum Periode ${next + 1} mulai`;
}

/** Why a quota is refused: every Evergreen content the period already has needs its slot. */
export function quotaProblem(quota: number, evergreenCount: number): string | undefined {
  return quota < evergreenCount
    ? `Minimal ${evergreenCount}, sesuai konten Evergreen yang sudah ada`
    : undefined;
}
