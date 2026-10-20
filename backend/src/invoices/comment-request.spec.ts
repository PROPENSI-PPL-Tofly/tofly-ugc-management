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

const invalid = (message: string) => ({ code: 'COMMENT_INVALID', message });

describe('checkInvoiceComment', () => {
  it('takes the text trimmed, keeping its line breaks', () => {
    expect(checkInvoiceComment({ text: '  Baris satu\nBaris dua  ' })).toEqual({
      text: 'Baris satu\nBaris dua',
    });
  });

  it.each([null, ['Halo'], 'Halo'])(
    'refuses a body that is not an object (%j)',
    (body) => {
      expect(refusalOf(body)).toEqual(invalid('Data komentar tidak valid'));
    },
  );

  // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): the author and role are the
  // server's to record; a body that sends them is refused, not half-trusted.
  it('refuses a body that sends its own author role', () => {
    expect(refusalOf({ text: 'Halo', authorRole: 'admin' })).toEqual(
      invalid('Data komentar tidak valid'),
    );
  });

  it.each([{}, { text: 5 }, { text: '  \n ' }])(
    'refuses missing or blank text (%j)',
    (body) => {
      expect(refusalOf(body)).toEqual(invalid('Komentar wajib diisi'));
    },
  );

  // Counted after trimming and in characters, as varchar(500) counts them.
  it('takes 500 characters and refuses 501 (off by one)', () => {
    expect(checkInvoiceComment({ text: ` ${'😀'.repeat(500)} ` }).text).toBe(
      '😀'.repeat(500),
    );
    expect(refusalOf({ text: 'a'.repeat(501) })).toEqual(
      invalid('Komentar maksimal 500 karakter'),
    );
  });
});
