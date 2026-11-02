import type { link_data_state } from '@prisma/client';

// A video link's performance data state (PBI-27 AC 3) as objects, one per kind of behaviour
// (State). What a state means for a card or a list, and whether an admin may type numbers in,
// lives with the state, the way invoice-lifecycle.ts keeps an invoice's rules. 27.4's sync
// decides its own transitions; these states only answer for 27.1.

/** One stored data state of a video link and what it means (PBI-27 AC 3). */
export interface LinkState {
  readonly stored: link_data_state;
  /** The state a card or list shows, given whether the creator connected that platform. */
  effective(connected: boolean): link_data_state;
  /** Refuses with 409 MANUAL_NOT_ALLOWED unless an admin may type this link's numbers in (AC 14). */
  assertAcceptsManual(connected: boolean): void;
}

/**
 * No numbers yet. A creator who never connected the platform cannot be synced, so the link is
 * shown as not_connected straight away and an admin can fill it in without waiting for a sync.
 * Only shown, never stored: connecting the account later makes it plain waiting again.
 */
class WaitingLinkState implements LinkState {
  readonly stored = 'waiting' as const;

  effective(connected: boolean): link_data_state {
    return connected ? 'waiting' : 'not_connected';
  }

  assertAcceptsManual(): void {}
}

/** A state shown as it is stored, whatever the account: the last outcome already says it. */
class SettledLinkState implements LinkState {
  constructor(readonly stored: Exclude<link_data_state, 'waiting'>) {}

  effective(): link_data_state {
    return this.stored;
  }

  assertAcceptsManual(): void {}
}

const STATES: Readonly<Record<link_data_state, LinkState>> = Object.freeze({
  waiting: new WaitingLinkState(),
  not_connected: new SettledLinkState('not_connected'),
  synced: new SettledLinkState('synced'),
  not_found: new SettledLinkState('not_found'),
  sync_failed: new SettledLinkState('sync_failed'),
  manual: new SettledLinkState('manual'),
});

/** The behaviour of the state a link was read in. */
export function linkState(stored: link_data_state): LinkState {
  return STATES[stored];
}
