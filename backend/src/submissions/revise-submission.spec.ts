import {
  checkRevisionRequest,
  MAX_REVISION_NOTES_LENGTH,
} from './revise-submission.js';

describe('checkRevisionRequest', () => {
  it('accepts the revision note supplied by the admin', () => {
    expect(
      checkRevisionRequest({ revisionNotes: 'Please improve the introduction.' }),
    ).toEqual({
      revisionNotes: 'Please improve the introduction.',
      revisionNotesHtml: 'Please improve the introduction.',
    });
  });
  it('rejects a null request body with a field-specific 422 error', () => {
    expect(() => checkRevisionRequest(null)).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          message: 'Data revisi tidak valid',
          errors: {
            revisionNotes: 'Catatan revisi harus berupa teks',
          },
        },
      }),
    );
  });
  it('rejects a numeric revision note with a field-specific 422 error', () => {
    expect(() => checkRevisionRequest({ revisionNotes: 42 })).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          message: 'Data revisi tidak valid',
          errors: {
            revisionNotes: 'Catatan revisi harus berupa teks',
          },
        },
      }),
    );
  });
  it('rejects an undefined request body with a field-specific 422 error', () => {
    expect(() => checkRevisionRequest(undefined)).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          message: 'Data revisi tidak valid',
          errors: {
            revisionNotes: 'Catatan revisi harus berupa teks',
          },
        },
      }),
    );
  });
  it('excludes client-supplied protected fields from the validated request', () => {
    expect(
      checkRevisionRequest({
        revisionNotes: 'Mohon perbaiki bagian pembuka.',
        status: 'draft_approved',
        is_admin: true,
        reviewerId: 'forged-reviewer',
        contentId: 'another-content',
        revisionHistory: [],
        createdAt: '2000-01-01',
      }),
    ).toEqual({
      revisionNotes: 'Mohon perbaiki bagian pembuka.',
      revisionNotesHtml: 'Mohon perbaiki bagian pembuka.',
    });
  });
  it('rejects a blank revision note with a field-specific 422 error', () => {
  expect(() =>
    checkRevisionRequest({
      revisionNotes: '   ',
    }),
  ).toThrow(
    expect.objectContaining({
      status: 422,
      response: {
        message: 'Data revisi tidak valid',
        errors: {
          revisionNotes: 'Catatan revisi tidak boleh kosong',
        },
      },
    }),
  );
});

  it('stores the note trimmed', () => {
    expect(checkRevisionRequest({ revisionNotes: '  Perbaiki intro.  ' })).toEqual({
      revisionNotes: 'Perbaiki intro.',
      revisionNotesHtml: 'Perbaiki intro.',
    });
  });

  it('accepts a note of exactly the maximum length', () => {
    const revisionNotes = 'a'.repeat(MAX_REVISION_NOTES_LENGTH);
    expect(checkRevisionRequest({ revisionNotes })).toEqual({
      revisionNotes,
      revisionNotesHtml: revisionNotes,
    });
  });

  it('refuses a note longer than the maximum, naming the limit', () => {
    expect(MAX_REVISION_NOTES_LENGTH).toBe(1000);
    expect(() =>
      checkRevisionRequest({ revisionNotes: 'a'.repeat(MAX_REVISION_NOTES_LENGTH + 1) }),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          message: 'Data revisi tidak valid',
          errors: { revisionNotes: 'Catatan revisi maksimal 1000 karakter' },
        },
      }),
    );
  });

  it('counts the words of the editor HTML toward the limit, never its tags (AC 2)', () => {
    const words = 'a'.repeat(MAX_REVISION_NOTES_LENGTH);

    expect(checkRevisionRequest({ revisionNotes: `<strong>${words}</strong>` })).toEqual({
      revisionNotes: words,
      revisionNotesHtml: `<strong>${words}</strong>`,
    });

    expect(() =>
      checkRevisionRequest({ revisionNotes: `<strong>${words}b</strong>` }),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          message: 'Data revisi tidak valid',
          errors: { revisionNotes: 'Catatan revisi maksimal 1000 karakter' },
        },
      }),
    );
  });

  it('sanitizes the note on the way in, so no script can ride along into storage (AC 7)', () => {
    expect(
      checkRevisionRequest({
        revisionNotes: '<p>Aman</p><script>steal()</script><p onmouseover="x()">Tetap</p>',
      }),
    ).toEqual({
      revisionNotes: 'Aman\nTetap',
      revisionNotesHtml: '<p>Aman</p><p>Tetap</p>',
    });
  });

  it('keeps the words of each paragraph and list item apart (AC 2)', () => {
    expect(
      checkRevisionRequest({
        revisionNotes: '<ul><li>Satu</li><li>Dua</li></ul>',
      }),
    ).toEqual({
      revisionNotes: 'Satu\nDua',
      revisionNotesHtml: '<ul><li>Satu</li><li>Dua</li></ul>',
    });
  });

  describe('the limits of a revision note', () => {
    const notText = expect.objectContaining({
      status: 422,
      response: {
        message: 'Data revisi tidak valid',
        errors: { revisionNotes: 'Catatan revisi harus berupa teks' },
      },
    });
    const empty = expect.objectContaining({
      status: 422,
      response: {
        message: 'Data revisi tidak valid',
        errors: { revisionNotes: 'Catatan revisi tidak boleh kosong' },
      },
    });
    const tooLong = expect.objectContaining({
      status: 422,
      response: {
        message: 'Data revisi tidak valid',
        errors: { revisionNotes: 'Catatan revisi maksimal 1000 karakter' },
      },
    });

    it('accepts the shortest note, a single character', () => {
      expect(checkRevisionRequest({ revisionNotes: 'a' })).toEqual({
        revisionNotes: 'a',
        revisionNotesHtml: 'a',
      });
    });

    it('measures the limit after trimming, so spaces around a full-length note do not count', () => {
      const note = 'a'.repeat(MAX_REVISION_NOTES_LENGTH);

      expect(checkRevisionRequest({ revisionNotes: `  ${note}\n` })).toEqual({
        revisionNotes: note,
        revisionNotesHtml: note,
      });
    });

    it('refuses a note one character over the limit even when spaces surround it', () => {
      const note = 'a'.repeat(MAX_REVISION_NOTES_LENGTH + 1);

      expect(() => checkRevisionRequest({ revisionNotes: `  ${note}  ` })).toThrow(
        tooLong,
      );
    });

    it('keeps the line breaks inside a note', () => {
      expect(
        checkRevisionRequest({ revisionNotes: 'Perbaiki intro.\nGanti musik.' }),
      ).toEqual({
        revisionNotes: 'Perbaiki intro.\nGanti musik.',
        revisionNotesHtml: 'Perbaiki intro.\nGanti musik.',
      });
    });

    it.each([
      ['an empty string', ''],
      ['tabs and line breaks only', '\t\n\r\n'],
    ])('refuses %s as an empty note', (_label, revisionNotes) => {
      expect(() => checkRevisionRequest({ revisionNotes })).toThrow(empty);
    });

    it.each([
      ['a missing note', {}],
      ['a null note', { revisionNotes: null }],
      ['a boolean note', { revisionNotes: true }],
      ['a list as the note', { revisionNotes: ['Perbaiki intro.'] }],
      ['an object as the note', { revisionNotes: { text: 'Perbaiki intro.' } }],
    ])('refuses %s as not text', (_label, body) => {
      expect(() => checkRevisionRequest(body)).toThrow(notText);
    });

    it.each([
      ['a bare string', 'Perbaiki intro.'],
      ['a number', 42],
      ['a boolean', false],
      ['a list', [{ revisionNotes: 'Perbaiki intro.' }]],
    ])('refuses a body that is %s, not an object, with 422 rather than a crash', (_label, body) => {
      expect(() => checkRevisionRequest(body)).toThrow(notText);
    });
  });

  describe('the screenshots the editor sends the note with', () => {
    const IMAGE_A = '33333333-3333-4333-8333-333333333333';
    const IMAGE_B = '22222222-2222-4222-8222-222222222222';

    it('takes the image ids the editor named, in the order it named them', () => {
      expect(
        checkRevisionRequest({
          revisionNotes: 'Perbaiki intro.',
          imageIds: [IMAGE_A, IMAGE_B, IMAGE_A],
        }),
      ).toEqual({
        revisionNotes: 'Perbaiki intro.',
        revisionNotesHtml: 'Perbaiki intro.',
        imageIds: [IMAGE_A, IMAGE_B],
      });
    });

    it('names no images at all when the editor has none', () => {
      expect(
        checkRevisionRequest({ revisionNotes: 'Perbaiki intro.' }),
      ).not.toHaveProperty('imageIds');
      expect(
        checkRevisionRequest({ revisionNotes: 'Perbaiki intro.', imageIds: [] }),
      ).not.toHaveProperty('imageIds');
    });

    it.each([
      ['a bare name', IMAGE_A],
      ['a list holding something that is not a name', [IMAGE_A, 7]],
      ['an object where the list belongs', { imageIds: [IMAGE_A] }],
    ])('refuses %s as not a list of image names', (_label, imageIds) => {
      expect(() =>
        checkRevisionRequest({ revisionNotes: 'Perbaiki intro.', imageIds }),
      ).toThrow(
        expect.objectContaining({
          status: 422,
          response: {
            message: 'Data revisi tidak valid',
            errors: { imageIds: 'Gambar tidak valid' },
          },
        }),
      );
    });

    it('refuses more than five images with the limit wording (AC 4)', () => {
      const imageIds = Array.from(
        { length: 6 },
        (_, index) => `33333333-3333-4333-8333-33333333330${index}`,
      );

      expect(() =>
        checkRevisionRequest({ revisionNotes: 'Perbaiki intro.', imageIds }),
      ).toThrow(
        expect.objectContaining({
          response: {
            message: 'Data revisi tidak valid',
            errors: { imageIds: 'Maksimal 5 gambar per catatan' },
          },
        }),
      );
    });
  });
});
