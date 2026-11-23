// The days a deadline may fall on (PBI-23 AC 22, SCRUM-298), as a value object. One stored buffer
// draws both lines: the earliest is max(contract start, today) + buffer, the latest is contract
// end − buffer. Every deadline touchpoint asks a window instead of computing either line itself, so
// the two lines can never be drawn with different buffers (OWASP A08:2025).

import { readableDay } from '../creators/evergreen.js';

// PBI-23 AC 20: a whole number of days from 1 to 14, 5 until a Super Admin changes it.
export const MIN_BUFFER_DAYS = 1;
export const MAX_BUFFER_DAYS = 14;
export const DEFAULT_BUFFER_DAYS = 5;

export interface WindowFacts {
  contractStart: string;
  contractEnd: string;
  // Today in Jakarta (jakartaDay).
  today: string;
  bufferDays: number;
}

export function isBufferDays(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= MIN_BUFFER_DAYS &&
    (value as number) <= MAX_BUFFER_DAYS
  );
}

// ISO days order the same as text and as dates.
function shift(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class DeadlineWindow {
  private constructor(
    readonly earliest: string,
    readonly latest: string,
    readonly bufferDays: number,
  ) {}

  static of({
    contractStart,
    contractEnd,
    today,
    bufferDays,
  }: WindowFacts): DeadlineWindow {
    // A buffer the setting can never hold is a bug upstream: fail instead of judging by it.
    if (!isBufferDays(bufferDays)) {
      throw new RangeError(
        `bufferDays must be a whole number from ${MIN_BUFFER_DAYS} to ${MAX_BUFFER_DAYS}`,
      );
    }
    const from = contractStart > today ? contractStart : today;
    return new DeadlineWindow(
      shift(from, bufferDays),
      shift(contractEnd, -bufferDays),
      bufferDays,
    );
  }

  /** Why a deadline falls outside the window, or nothing when it fits. */
  problem(day: string): string | undefined {
    if (day < this.earliest) return this.tooEarly();
    if (day > this.latest) return this.tooLate();
    return undefined;
  }

  tooEarly(): string {
    return `Deadline paling cepat ${readableDay(this.earliest)}`;
  }

  tooLate(): string {
    return `Deadline paling lambat ${readableDay(this.latest)} (H-${this.bufferDays} akhir kontrak)`;
  }
}
