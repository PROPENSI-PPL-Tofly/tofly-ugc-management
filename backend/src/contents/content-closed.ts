import { ConflictException } from '@nestjs/common';

/**
 * PBI-37: the one refusal of a draft or a link a creator hands in for content an early end closed
 * (due after the contract's new last day). A 409 like PERIOD_NOT_STARTED: the content is theirs,
 * it just takes no more hand-ins.
 */
export function contentClosed(): ConflictException {
  return new ConflictException({
    code: 'CONTENT_CLOSED',
    message: 'Konten ini ditutup karena kontrak diakhiri lebih awal',
  });
}
