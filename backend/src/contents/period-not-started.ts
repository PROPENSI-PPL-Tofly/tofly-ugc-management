import { ConflictException } from '@nestjs/common';

/**
 * PBI-30.2 (AC 8.2.2): the one refusal of a draft or a link handed in for content whose contract
 * period has not started. It is a 409 like DRAFT_NOT_ELIGIBLE and VIDEO_NOT_ELIGIBLE: the
 * content is the creator's own (another creator's still reads as a 404), it just cannot take a
 * hand-in yet.
 */
export function periodNotStarted(): ConflictException {
  return new ConflictException({
    code: 'PERIOD_NOT_STARTED',
    message: 'Periode kontrak konten ini belum dimulai',
  });
}
