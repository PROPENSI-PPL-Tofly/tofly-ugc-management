import { checkFollowUp, MAX_FOLLOW_UP_LENGTH } from './follow-up-note.js';

// 422 with the reason under `note`, the field the admin's form (33.2) reads.
const refusedWith = (reason: string) =>
  expect.objectContaining({
    status: 422,
    response: {
      message: 'Data catatan susulan tidak valid',
      errors: { note: reason },
    },
  });

describe('checkFollowUp', () => {
  // Positive (AC 2): the follow-up the admin wrote, without the spaces around it.
  it('takes the note, trimmed', () => {
    expect(checkFollowUp({ note: '  Intro juga dipotong ya.  ' })).toEqual({
      note: 'Intro juga dipotong ya.',
    });
  });

  // Negative: a body that carries no text note.
  it.each([
    ['no body', null],
    ['an empty body', undefined],
    ['no note', {}],
    ['a note that is not text', { note: 42 }],
  ])('refuses %s as not text', (_what, body) => {
    expect(() => checkFollowUp(body)).toThrow(
      refusedWith('Catatan susulan harus berupa teks'),
    );
  });

  // Negative (AC 2): at least 1 character.
  it.each([
    ['an empty note', ''],
    ['a note of spaces and line breaks', '  \n\t '],
  ])('refuses %s as empty', (_what, note) => {
    expect(() => checkFollowUp({ note })).toThrow(
      refusedWith('Catatan susulan tidak boleh kosong'),
    );
  });

  // Corner (AC 2): 1,000 is the last length allowed, counted once trimmed.
  it('takes exactly 1,000 characters, even with spaces around them', () => {
    const note = 'a'.repeat(MAX_FOLLOW_UP_LENGTH);

    expect(checkFollowUp({ note })).toEqual({ note });
    expect(checkFollowUp({ note: `  ${note}  ` })).toEqual({ note });
  });

  it('refuses 1,001 characters', () => {
    expect(() =>
      checkFollowUp({ note: 'a'.repeat(MAX_FOLLOW_UP_LENGTH + 1) }),
    ).toThrow(refusedWith('Catatan susulan maksimal 1000 karakter'));
  });

  it('allows the same room as the revision note it adds to', () => {
    expect(MAX_FOLLOW_UP_LENGTH).toBe(1000);
  });
});
