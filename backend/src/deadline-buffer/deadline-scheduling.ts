// What a service that schedules a deadline is handed (SCRUM-298): the clock and the stored buffer.
// Tambah Konten (ContentCreationService) and content edit (ContentEditService) already take it
// under this token; the rest of the deadline rules take it too.

import type { DeadlineBufferReader } from './deadline-buffer.service.js';

export const CONTENT_SCHEDULING = 'CONTENT_SCHEDULING';

export interface ContentScheduling {
  today(): Date;
  bufferDays(): Promise<number>;
}

export function schedulingFrom(
  buffer: DeadlineBufferReader,
): ContentScheduling {
  return {
    today: () => new Date(),
    bufferDays: () => buffer.current(),
  };
}
