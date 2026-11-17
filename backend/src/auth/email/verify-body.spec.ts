import { UnprocessableEntityException } from '@nestjs/common';
import { checkVerifyBody } from './verify-body.js';

function errorsOf(body: unknown): unknown {
  try {
    checkVerifyBody(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  throw new Error('expected the body to be refused');
}

describe('checkVerifyBody', () => {
  it('accepts an email and six digits, trimming and lower-casing the email', () => {
    expect(
      checkVerifyBody({ email: ' Rangga@Example.com ', code: '012345' }),
    ).toEqual({ email: 'rangga@example.com', code: '012345' });
  });

  it('names the email when it is not a valid address', () => {
    expect(errorsOf({ email: 'not-an-email', code: '123456' })).toEqual({
      message: 'Data tidak valid',
      errors: { email: 'Format email tidak valid' },
    });
  });

  it('refuses an email longer than 254 characters', () => {
    const email = `${'a'.repeat(243)}@example.com`;
    expect(email).toHaveLength(255);
    expect(errorsOf({ email, code: '123456' })).toMatchObject({
      errors: { email: 'Format email tidak valid' },
    });
  });

  it.each([
    ['five digits', '12345'],
    ['seven digits', '1234567'],
    ['letters', '12a456'],
    ['a trailing newline', '123456\n'],
    ['a number rather than a string', 123456],
    ['nothing', undefined],
  ])('names the code when it is %s', (_label, code) => {
    expect(errorsOf({ email: 'a@example.com', code })).toEqual({
      message: 'Data tidak valid',
      errors: { code: 'Kode harus 6 digit' },
    });
  });

  it.each([[null], ['text'], [[]]])('refuses %j as a body', (body) => {
    expect(errorsOf(body)).toEqual({
      message: 'Data tidak valid',
      errors: { email: 'Email wajib diisi', code: 'Kode harus 6 digit' },
    });
  });
});
