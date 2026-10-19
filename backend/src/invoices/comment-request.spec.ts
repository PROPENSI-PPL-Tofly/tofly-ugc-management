import { UnprocessableEntityException } from '@nestjs/common';
import { checkInvoiceComment } from './comment-request.js';

function refusalOf(body: unknown): unknown {
  try {
    checkInvoiceComment(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  return expect.unreachable('the comment must be refused');
}

const REQUIRED = { code: 'COMMENT_INVALID', message: 'Komentar wajib diisi' };
const TOO_LONG = {
  code: 'COMMENT_INVALID',
  message: 'Komentar maksimal 500 karakter',
};
const MALFORMED = {
  code: 'COMMENT_INVALID',
  message: 'Data komentar tidak valid',
};

describe('checkInvoiceComment', () => {
  describe('accepts', () => {
    it('a short comment', () => {
      expect(checkInvoiceComment({ text: 'Halo' })).toEqual({ text: 'Halo' });
    });

    it('a comment trimmed of the spaces around it', () => {
      expect(checkInvoiceComment({ text: '  Sudah dicek ya.  \n' })).toEqual({
        text: 'Sudah dicek ya.',
      });
    });

    it('a comment over several lines, keeping its line breaks', () => {
      expect(checkInvoiceComment({ text: 'Baris satu\nBaris dua' })).toEqual({
        text: 'Baris satu\nBaris dua',
      });
    });
  });

  // OWASP Top 10:2025 A05 (Injection) and A08 (Software and Data Integrity Failures): only the
  // text crosses the boundary; who wrote it, as what and when are the server's to record.
  describe('refuses', () => {
    it.each([null, undefined, 'Halo', 42, ['Halo']])(
      'a body that is not an object (%j)',
      (body) => {
        expect(refusalOf(body)).toEqual(MALFORMED);
      },
    );

    it.each([
      ['an author role', { text: 'Halo', authorRole: 'admin' }],
      ['an author', { text: 'Halo', authorUserId: 'someone' }],
      ['a time', { text: 'Halo', createdAt: '2020-01-01T00:00:00Z' }],
    ])('a body that also sends %s', (_case, body) => {
      expect(refusalOf(body)).toEqual(MALFORMED);
    });

    it.each([
      ['missing', {}],
      ['a number', { text: 5 }],
      ['an object', { text: { toString: 'x' } }],
      ['empty', { text: '' }],
      ['only spaces and line breaks', { text: '  \n\t ' }],
    ])('text that is %s', (_case, body) => {
      expect(refusalOf(body)).toEqual(REQUIRED);
    });

    it('501 characters once trimmed', () => {
      expect(refusalOf({ text: 'a'.repeat(501) })).toEqual(TOO_LONG);
    });
  });

  describe('edge:', () => {
    it('takes exactly 500 characters', () => {
      expect(checkInvoiceComment({ text: 'a'.repeat(500) }).text).toHaveLength(
        500,
      );
    });

    it('takes 500 characters with spaces around them, counted after trimming', () => {
      expect(
        checkInvoiceComment({ text: `   ${'a'.repeat(500)}   ` }).text,
      ).toHaveLength(500);
    });

    // varchar(500) counts characters: 500 emoji outside the BMP fit the column, though they are
    // 1000 UTF-16 units. The form counts units, so it never sends more than the server takes.
    it('counts an emoji as one character, as the column does', () => {
      expect(
        Array.from(checkInvoiceComment({ text: '😀'.repeat(500) }).text),
      ).toHaveLength(500);
      expect(refusalOf({ text: '😀'.repeat(501) })).toEqual(TOO_LONG);
    });

    it('stores markup as typed: the pages escape it when they show it', () => {
      const text = '<script>alert(1)</script>';

      expect(checkInvoiceComment({ text })).toEqual({ text });
    });
  });
});
