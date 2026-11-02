import type { link_data_state } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { CLEARED_PERFORMANCE, linkState } from './link-state.js';

const ALL_STATES: link_data_state[] = [
  'waiting',
  'not_connected',
  'synced',
  'not_found',
  'sync_failed',
  'manual',
];

describe('linkState', () => {
  describe('effective state, as a card and a list show it', () => {
    it('reads a waiting link as not_connected while its creator has not connected that platform', () => {
      expect(linkState('waiting').effective(false)).toBe('not_connected');
    });

    it('keeps a waiting link waiting once the account is connected', () => {
      expect(linkState('waiting').effective(true)).toBe('waiting');
    });

    it.each(ALL_STATES.filter((state) => state !== 'waiting'))(
      'shows a %s link as stored, connected or not',
      (state) => {
        expect(linkState(state).effective(true)).toBe(state);
        expect(linkState(state).effective(false)).toBe(state);
      },
    );
  });

  describe('manual entry (AC 14)', () => {
    /** The 409 a state refuses manual numbers with, or null when it takes them. */
    function refusal(state: link_data_state, connected: boolean): unknown {
      try {
        linkState(state).assertAcceptsManual(connected);
        return null;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        return error.getResponse();
      }
    }

    const REFUSED = {
      code: 'MANUAL_NOT_ALLOWED',
      message:
        'Angka manual hanya bisa diisi untuk link yang akunnya belum terhubung, tidak ditemukan, gagal sinkron, atau sudah diisi manual',
    };

    it.each(['not_connected', 'not_found', 'sync_failed', 'manual'] as const)(
      'lets an admin fill a %s link, connected or not',
      (state) => {
        expect(refusal(state, true)).toBeNull();
        expect(refusal(state, false)).toBeNull();
      },
    );

    it('lets an admin fill a waiting link whose account is not connected, before any sync runs', () => {
      expect(refusal('waiting', false)).toBeNull();
    });

    it('refuses a waiting link whose account is connected: the sync will bring its numbers', () => {
      expect(refusal('waiting', true)).toEqual(REFUSED);
    });

    it('refuses a synced link, connected or not: the platform already gave its numbers', () => {
      expect(refusal('synced', true)).toEqual(REFUSED);
      expect(refusal('synced', false)).toEqual(REFUSED);
    });
  });

  it('names the state it was read from', () => {
    for (const state of ALL_STATES) {
      expect(linkState(state).stored).toBe(state);
    }
  });

  describe('a replaced link (PBI-38 AC 9)', () => {
    it('starts again with no numbers, waiting, never synced and not filled by hand', () => {
      expect(CLEARED_PERFORMANCE).toEqual({
        views: null,
        likes: null,
        comments: null,
        shares: null,
        data_state: 'waiting',
        last_synced_at: null,
        manual_by: null,
        manual_at: null,
      });
    });

    it('cannot be changed at runtime', () => {
      expect(Object.isFrozen(CLEARED_PERFORMANCE)).toBe(true);
    });
  });
});
