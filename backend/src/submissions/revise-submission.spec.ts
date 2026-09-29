import {
  checkRevisionRequest,
  MAX_REVISION_NOTES_LENGTH,
} from './revise-submission.js';

describe('checkRevisionRequest', () => { 
  it('accepts the revision note supplied by the admin', () => {
    expect( 
      checkRevisionRequest({ revisionNotes: 'Please improve the introduction.' }),
    ).toEqual({ revisionNotes: 'Please improve the introduction.' }); 
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
    ).toEqual({ revisionNotes: 'Mohon perbaiki bagian pembuka.' });
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
    });
  });

  it('accepts a note of exactly the maximum length', () => {
    const revisionNotes = 'a'.repeat(MAX_REVISION_NOTES_LENGTH);
    expect(checkRevisionRequest({ revisionNotes })).toEqual({ revisionNotes });
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
});
