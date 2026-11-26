// Pure rules for a creator's contract periods (PBI-30): a new or edited period is checked by the
// Tambah Creator rules, may not overlap another period, and may only be changed before it starts.
// No Nest wiring or Prisma here, so each rule is tested without a database.
import { UnprocessableEntityException } from '@nestjs/common';
import { DeadlineWindow } from '../deadline-buffer/deadline-window.js';
import { jakartaMidnight, readableDay } from './evergreen.js';
import {
  checkContractTerms,
  type ContractTerms,
  type NewCreatorErrors,
} from './new-creator.js';

/**
 * Validates the "Perpanjang Kontrak" body (and an edit of a period that has not started) by the
 * same rules and field names as Tambah Creator, answering anything invalid with one 422.
 */
export function checkNewPeriod(
  input: unknown,
  now: Date,
  bufferDays: number,
): ContractTerms {
  // As in checkNewCreator: a missing or null body reads as a blank form, not a TypeError.
  const body: Record<string, unknown> = { ...(input as object) };
  const errors: NewCreatorErrors = {};
  const terms = checkContractTerms(body, now, bufferDays, errors);

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data periode tidak valid',
      errors,
    });
  }
  return terms;
}

/** A period has started on its first day in Jakarta; from then on it is no longer editable. */
export function periodHasStarted(startDate: Date, now: Date): boolean {
  return startDate.getTime() <= jakartaMidnight(now).getTime();
}

/** Another of the creator's periods, as stored. */
export interface StoredPeriod {
  startDate: Date;
  endDate: Date;
}

type PeriodDates = Pick<ContractTerms, 'contractStart' | 'contractEnd'>;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Why the period clashes with another, or undefined when it does not. Both first and last days
 * belong to a period, so the next one may start the day after the previous one ends at the
 * earliest. The earliest clash is named, so the message is the same however the rows arrive.
 */
export function overlappingPeriod(
  { contractStart, contractEnd }: PeriodDates,
  others: readonly StoredPeriod[],
): string | undefined {
  const clash = others
    .filter(
      (other) =>
        other.startDate.getTime() <= contractEnd.getTime() &&
        contractStart.getTime() <= other.endDate.getTime(),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];

  return clash
    ? `Periode bertabrakan dengan kontrak ${readableDay(isoDay(clash.startDate))} – ${readableDay(isoDay(clash.endDate))}`
    : undefined;
}

/** Specific content already scheduled in a period that has not started. */
export interface ScheduledSpecific {
  name: string;
  deadline: Date;
}

/**
 * The first Specific content an edit would leave outside the period's deadline window (start +
 * buffer to end − H-5, as Tambah Konten allows), or undefined when all of it still fits. The edit
 * is refused rather than the content moved or deleted, so nothing an admin added is lost silently.
 */
export function specificOutsidePeriod(
  { contractStart, contractEnd }: PeriodDates,
  specifics: readonly ScheduledSpecific[],
  now: Date,
  bufferDays: number,
): string | undefined {
  const { earliest, latest } = DeadlineWindow.of({
    contractStart: isoDay(contractStart),
    contractEnd: isoDay(contractEnd),
    today: isoDay(jakartaMidnight(now)),
    bufferDays,
  });
  const outside = specifics.find(({ deadline }) => {
    const due = isoDay(deadline);
    return due < earliest || due > latest;
  });

  return outside
    ? `Konten "${outside.name}" (deadline ${readableDay(isoDay(outside.deadline))}) di luar periode baru (${readableDay(earliest)} – ${readableDay(latest)}); pindahkan atau hapus dulu`
    : undefined;
}
