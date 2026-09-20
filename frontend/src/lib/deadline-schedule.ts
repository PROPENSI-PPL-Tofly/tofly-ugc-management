export interface DeadlineScheduleInput {
  contractStart: string;
  contractEnd: string;
  today: string;
  bufferDays: number;
  intervalDays: number;
  quota: number;
}

export function generateDeadlineSchedule(input: DeadlineScheduleInput): string[] {
  // Use UTC calendar arithmetic so the browser's timezone cannot shift the date.
  const firstDeadline = new Date(`${input.contractStart}T00:00:00Z`);
  firstDeadline.setUTCDate(firstDeadline.getUTCDate() + input.bufferDays);

  return [firstDeadline.toISOString().slice(0, 10)];
}
