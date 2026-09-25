import { checkRevisionRequest } from './revise-submission.js';

describe('checkRevisionRequest', () => {
  it('accepts the revision note supplied by the admin', () => {
    expect(
      checkRevisionRequest({ revisionNotes: 'Please improve the introduction.' }),
    ).toEqual({ revisionNotes: 'Please improve the introduction.' });
  });

});
