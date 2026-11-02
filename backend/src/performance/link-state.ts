import { ConflictException } from '@nestjs/common';
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

function manualNotAllowed(): ConflictException {
  return new ConflictException({
    code: 'MANUAL_NOT_ALLOWED',
    message:
      'Angka manual hanya bisa diisi untuk link yang akunnya belum terhubung, tidak ditemukan, gagal sinkron, atau sudah diisi manual',
  });
}

/**
 * No numbers yet. A creator who never connected the platform cannot be synced, so the link is
 * shown as not_connected straight away and an admin can fill it in without waiting for a sync.
 * Only shown, never stored: connecting the account later makes it plain waiting again, and the
 * sync then brings its numbers, so an admin is refused.
 */
class WaitingLinkState implements LinkState {
  readonly stored = 'waiting' as const;

  effective(connected: boolean): link_data_state {
    return connected ? 'waiting' : 'not_connected';
  }

  assertAcceptsManual(connected: boolean): void {
    if (connected) throw manualNotAllowed();
  }
}

/**
 * A link the platform cannot read (not connected, not found, failed), or one already filled by
 * hand: shown as stored, and an admin may type its numbers in (AC 14).
 */
class OpenLinkState implements LinkState {
  constructor(
    readonly stored: Exclude<link_data_state, 'waiting' | 'synced'>,
  ) {}

  effective(): link_data_state {
    return this.stored;
  }

  assertAcceptsManual(): void {}
}

/** The platform gave the numbers: shown as synced, and never overwritten by hand. */
class SyncedLinkState implements LinkState {
  readonly stored = 'synced' as const;

  effective(): link_data_state {
    return this.stored;
  }

  assertAcceptsManual(): never {
    throw manualNotAllowed();
  }
}

const STATES: Readonly<Record<link_data_state, LinkState>> = Object.freeze({
  waiting: new WaitingLinkState(),
  not_connected: new OpenLinkState('not_connected'),
  synced: new SyncedLinkState(),
  not_found: new OpenLinkState('not_found'),
  sync_failed: new OpenLinkState('sync_failed'),
  manual: new OpenLinkState('manual'),
});

/** The behaviour of the state a link was read in. */
export function linkState(stored: link_data_state): LinkState {
  return STATES[stored];
}
