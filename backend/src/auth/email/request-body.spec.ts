import { UnprocessableEntityException } from '@nestjs/common';
import { checkRequestBody } from './request-body.js';

function errorsOf(body: unknown): unknown {
  try {
    checkRequestBody(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  throw new Error('expected the body to be refused');
}

describe('checkRequestBody', () => {
  it('trims and lower-cases the email, as login_codes stores it', () => {
    expect(checkRequestBody({ email: '  Rangga@Example.COM ' })).toBe(
      'rangga@example.com',
    );
  });

  it('accepts an email of exactly 254 characters', () => {
    const email = `${'a'.repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    expect(checkRequestBody({ email })).toBe(email);
  });

  it('refuses an email longer than 254 characters', () => {
    const email = `${'a'.repeat(243)}@example.com`;
    expect(email).toHaveLength(255);
    expect(errorsOf({ email })).toEqual({
      message: 'Data tidak valid',
      errors: { email: 'Format email tidak valid' },
    });
  });

  it.each([
    ['no at sign', 'rangga.example.com'],
    ['two at signs', 'rangga@@example.com'],
    ['no dot in the domain', 'rangga@example'],
    ['a doubled dot', 'rangga..x@example.com'],
    ['a quote that could reach a query', "rangga'--@example.com"],
    ['a trailing newline inside', 'rangga@example.com\nx'],
  ])('refuses an address with %s', (_, email) => {
    expect(errorsOf({ email })).toEqual({
      message: 'Data tidak valid',
      errors: { email: 'Format email tidak valid' },
    });
  });

  it.each([
    ['a missing email', {}],
    ['a blank email', { email: '   ' }],
    ['an email that is not a string', { email: ['a@example.com'] }],
    ['a body that is not an object', 'a@example.com'],
    ['no body at all', undefined],
    ['a null body', null],
  ])('asks for the email given %s', (_, body) => {
    expect(errorsOf(body)).toEqual({
      message: 'Data tidak valid',
      errors: { email: 'Email wajib diisi' },
    });
  });
});
