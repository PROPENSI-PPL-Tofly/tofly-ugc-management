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
  const contractEnd = new Date(`${input.contractEnd}T00:00:00Z`); 
  const today = new Date(`${input.today}T00:00:00Z`);
  const firstDeadline = new Date(Math.max(contractStart.getTime(), today.getTime()));
  firstDeadline.setUTCDate(firstDeadline.getUTCDate() + input.bufferDays);

  const deadlines: string[] = []; //collect the generated deadlines in array of strings
  const currentDeadline = new Date(firstDeadline); //initialize currentDeadline to firstDeadline

  while (
    deadlines.length < input.quota && // Continue generating deadlines until the quota is met
    currentDeadline.getTime() <= contractEnd.getTime() // Ensure the current deadline does not exceed the contract end date
  ) {
    deadlines.push(currentDeadline.toISOString().slice(0, 10)); // Add the current deadline to the deadlines array
    currentDeadline.setUTCDate(currentDeadline.getUTCDate() + input.intervalDays); // Move to the next deadline by adding the interval days
  }

  return deadlines; 
}
