import type { link_data_state } from '@prisma/client';
import { linkState } from './link-state.js';

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

  it('names the state it was read from', () => {
    for (const state of ALL_STATES) {
      expect(linkState(state).stored).toBe(state);
    }
  });
});
