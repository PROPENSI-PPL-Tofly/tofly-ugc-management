import { UnprocessableEntityException } from '@nestjs/common';
import { checkRequestBody } from './request-body.js';

function refusal(body: unknown): unknown {
  try {
    checkRequestBody(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  throw new Error('expected a refusal');
}

describe('checkRequestBody', () => {
  it('trims and lower-cases the email, as login_codes stores it', () => {
    expect(checkRequestBody({ email: '  Rangga@Example.COM ' })).toEqual({
      email: 'rangga@example.com',
    });
  });

  it('accepts an email of exactly 254 characters', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`;

    expect(email).toHaveLength(254);
    expect(checkRequestBody({ email })).toEqual({ email });
  });

  it.each([
    ['missing', {}, 'Email wajib diisi'],
    ['blank', { email: '   ' }, 'Email wajib diisi'],
    ['not text', { email: 42 }, 'Email wajib diisi'],
    ['without an @', { email: 'rangga.example.com' }, 'Format email tidak valid'],
    [
      'longer than 254 characters',
      { email: `${'a'.repeat(64)}@${'b'.repeat(186)}.com` },
      'Format email tidak valid',
    ],
  ])('refuses an email that is %s, naming the field', (_label, body, message) => {
    expect(refusal(body)).toEqual({
      message: 'Data tidak valid',
      errors: { email: message },
    });
  });

  it.each([null, 'rangga@example.com', ['rangga@example.com']])(
    'refuses a body that is not an object: %j',
    (body) => {
      expect(refusal(body)).toEqual({
        message: 'Data tidak valid',
        errors: { email: 'Email wajib diisi' },
      });
    },
  );
});
