import type { link_data_state } from '@prisma/client';

/** One stored data state of a video link and what it means (PBI-27 AC 3). */
export interface LinkState {
  readonly stored: link_data_state;
  /** The state a card or list shows, given whether the creator connected that platform. */
  effective(connected: boolean): link_data_state;
}

export function linkState(_stored: link_data_state): LinkState {
  throw new Error('not implemented');
}
