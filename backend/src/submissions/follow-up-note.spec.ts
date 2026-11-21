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

  // AC 2 with PBI-34: a follow-up is written in the revision note's editor, so it arrives as
  // that editor's HTML. Its words are the note; the formatting is kept, sanitized on the server.
  it('takes a formatted follow-up, keeping its words and its sanitized formatting', () => {
    const request = checkFollowUp({
      note: '<p><strong>Ralat</strong>: musik versi <em>kedua</em></p><script>alert(1)</script>',
    });

    expect(request.note).toBe('Ralat: musik versi kedua');
    expect(request.noteHtml).toBe('<p><strong>Ralat</strong>: musik versi <em>kedua</em></p>');
  });

  it('counts a formatted follow-up on its words, not its tags', () => {
    const words = 'a'.repeat(MAX_FOLLOW_UP_LENGTH);

    expect(checkFollowUp({ note: `<p><strong>${words}</strong></p>` }).note).toBe(words);
    expect(() =>
      checkFollowUp({ note: `<p><strong>${words}a</strong></p>` }),
    ).toThrow(refusedWith('Catatan susulan maksimal 1000 karakter'));
  });

  it('refuses a formatted follow-up with no words', () => {
    expect(() => checkFollowUp({ note: '<p><strong> </strong></p>' })).toThrow(
      refusedWith('Catatan susulan tidak boleh kosong'),
    );
  });

  it('allows the same room as the revision note it adds to', () => {
    expect(MAX_FOLLOW_UP_LENGTH).toBe(1000);
  });

  // PBI-34 with PBI-33: a follow-up goes out with the screenshots the editor holds, by id.
  describe('screenshots', () => {
    const IMAGE = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';
    const OTHER = '4d3c2b1a-9f8e-4e7d-8c6b-5f4e3d2c1b0a';

    it('takes the image ids, each once, beside the note', () => {
      expect(
        checkFollowUp({
          note: `<p>Lihat</p><img data-image-id="${IMAGE}">`,
          imageIds: [IMAGE, OTHER, IMAGE],
        }),
      ).toEqual({
        note: 'Lihat',
        noteHtml: `<p>Lihat</p><img data-image-id="${IMAGE}" />`,
        imageIds: [IMAGE, OTHER],
      });
    });

    it('names no ids when there are none', () => {
      expect(checkFollowUp({ note: 'Catatan', imageIds: [] })).toEqual({
        note: 'Catatan',
      });
    });

    it.each([
      ['not a list', 'x'],
      ['a list of non-text', [1]],
    ])('refuses image ids that are %s, under imageIds', (_what, imageIds) => {
      expect(() => checkFollowUp({ note: 'Catatan', imageIds })).toThrow(
        expect.objectContaining({
          status: 422,
          response: {
            message: 'Data catatan susulan tidak valid',
            errors: { imageIds: 'Gambar tidak valid' },
          },
        }),
      );
    });

    it('refuses more images than a note may hold', () => {
      const imageIds = Array.from(
        { length: 6 },
        (_, index) => `4d3c2b1a-9f8e-4e7d-8c6b-5f4e3d2c1b0${index}`,
      );

      expect(() => checkFollowUp({ note: 'Catatan', imageIds })).toThrow(
        expect.objectContaining({
          status: 422,
          response: {
            message: 'Data catatan susulan tidak valid',
            errors: { imageIds: 'Maksimal 5 gambar per catatan' },
          },
        }),
      );
    });
  });
});
