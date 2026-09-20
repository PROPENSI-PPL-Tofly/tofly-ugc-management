export interface DeadlineScheduleInput {
  contractStart: string;
  contractEnd: string;
  today: string;
  bufferDays: number;
  intervalDays: number;
  quota: number;
}

export function generateDeadlineSchedule(input: DeadlineScheduleInput): string[] {
  // TDD Red: placeholder only; calculation will be added in the Green step.
  void input;
  return [];
}
