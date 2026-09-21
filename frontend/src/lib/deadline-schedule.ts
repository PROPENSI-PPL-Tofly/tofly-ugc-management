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
  const contractStart = new Date(`${input.contractStart}T00:00:00Z`);
  const today = new Date(`${input.today}T00:00:00Z`);
  const firstDeadline = new Date(Math.max(contractStart.getTime(), today.getTime()));
  firstDeadline.setUTCDate(firstDeadline.getUTCDate() + input.bufferDays);

  return [firstDeadline.toISOString().slice(0, 10)];
}
