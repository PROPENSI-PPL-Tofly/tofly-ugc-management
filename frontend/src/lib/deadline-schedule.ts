export interface DeadlineScheduleInput { // Interface for the input parameters required to generate a deadline schedule
  contractStart: string; // The start date of the contract in YYYY-MM-DD format
  contractEnd: string; // The end date of the contract in YYYY-MM-DD format
  today: string; // The current date in YYYY-MM-DD format
  bufferDays: number; // The number of days to wait after the contract start date before the first deadline
  intervalDays: number; // The number of days between each subsequent deadline
  quota: number; // The total number of deadlines to generate
}

export function getBufferWindow(
  input: Pick<DeadlineScheduleInput, 'contractStart' | 'today' | 'bufferDays'>,
) {
  // Use UTC calendar arithmetic so the browser's timezone cannot shift the date
  const contractStart = new Date(`${input.contractStart}T00:00:00Z`);
  const today = new Date(`${input.today}T00:00:00Z`);
  const bufferStartDate = new Date(Math.max(contractStart.getTime(), today.getTime()));
  const firstAllowedDate = new Date(bufferStartDate);
  firstAllowedDate.setUTCDate(firstAllowedDate.getUTCDate() + input.bufferDays);

  return { bufferStartDate, firstAllowedDate };
}

export function generateDeadlineSchedule(input: DeadlineScheduleInput): string[] {
  const contractEnd = new Date(`${input.contractEnd}T00:00:00Z`);
  const { firstAllowedDate } = getBufferWindow(input);

  const deadlines: string[] = []; //collect the generated deadlines in array of strings
  const currentDeadline = new Date(firstAllowedDate);

  while (
    deadlines.length < input.quota && // Continue generating deadlines until the quota is met
    currentDeadline.getTime() <= contractEnd.getTime() // Ensure the current deadline does not exceed the contract end date
  ) {
    deadlines.push(currentDeadline.toISOString().slice(0, 10)); // Add the current deadline to the deadlines array
    currentDeadline.setUTCDate(currentDeadline.getUTCDate() + input.intervalDays); // Move to the next deadline by adding the interval days
  }

  return deadlines; 
}

export interface DeadlinePreview { // Interface for the preview of deadlines generated based on the input
  autoDeadlines: string[]; // Array of automatically generated deadlines
  allocatedCount: number; // Count of deadlines that have been succesfully allocated 
  remainingCount: number; // Count of remaining slots that need to be filled to meet the quota
  quota: number; // The total number of deadlines that should be generated based on the input
}

export function getDeadlinePreview( // Function to get a preview of the deadlines based on the input parameters
  input: DeadlineScheduleInput, 
): DeadlinePreview { 
  const autoDeadlines = generateDeadlineSchedule(input); // Generate the automatic deadlines based on the input parameters

  return {
    autoDeadlines, 
    allocatedCount: autoDeadlines.length, 
    remainingCount: Math.max( //calculates how many content still need a deadline
      0,
      input.quota - autoDeadlines.length, 
    ),
    quota: input.quota,
  };
}
