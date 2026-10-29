import { UnprocessableEntityException } from '@nestjs/common';
import { checkCreatorComment } from './creator-comment.js';

const INVALID_INPUTS: Array<{ label: string; input: unknown }> = [
  { label: 'null', input: null },
  { label: 'undefined', input: undefined },
  { label: 'a string instead of an object', input: 'not-an-object' },
  { label: 'an array instead of an object', input: [] },
  { label: 'an object without a comment', input: {} },
  { label: 'a numeric comment', input: { comment: 123 } },
  { label: 'an empty comment', input: { comment: '' } },
  { label: 'a whitespace-only comment', input: { comment: '   ' } },
];

describe('checkCreatorComment', () => {
  it('returns the comment with surrounding whitespace removed', () => {
    expect(
      checkCreatorComment({
        comment: '  The draft has been updated.  ',
      }),
    ).toEqual({
      comment: 'The draft has been updated.',
    });
  });

  it.each(INVALID_INPUTS)('rejects $label', ({ input }) => {
    expect(() => checkCreatorComment(input)).toThrow(
      UnprocessableEntityException,
    );

    try {
      checkCreatorComment(input);
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);

      if (error instanceof UnprocessableEntityException) {
        expect(error.getResponse()).toEqual({
          message: 'Data komentar tidak valid',
          errors: {
            comment: 'Wajib diisi',
          },
        });
      }
    }
  });
});
