import { checkRevisionRequest } from './revise-submission.js';

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
});
