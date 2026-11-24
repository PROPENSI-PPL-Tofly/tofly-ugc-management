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

/** The contract of a content, as far as an early end limits hand-ins. */
export interface EarlyEndBound {
  /** The last day once the contract was ended early (PBI-37). */
  end_date: Date;
  /** Set only on a contract ended early. */
  original_end_date: Date | null;
}

/**
 * PBI-37 (AC 8): after the last day of a contract ended early nothing more is handed in, by a
 * creator or by an admin, so content counts as delivered only with a link by the last day and no
 * penalty or bonus runs past it. A contract that ends as agreed keeps its usual late hand-ins.
 */
export function assertNotPastEarlyEnd(contract: EarlyEndBound, today: string): void {
  if (
    contract.original_end_date !== null &&
    today > contract.end_date.toISOString().slice(0, 10)
  ) {
    throw new ConflictException({
      code: 'CONTRACT_ENDED_EARLY',
      message: 'Kontrak sudah diakhiri lebih awal. Tidak ada kiriman setelah hari terakhir',
    });
  }
}
