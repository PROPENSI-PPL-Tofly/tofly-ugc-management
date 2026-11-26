import { UnprocessableEntityException } from '@nestjs/common';
import { checkBufferDays } from './deadline-buffer-input.js';

function errorsOf(body: unknown): unknown {
  try {
    checkBufferDays(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  return undefined;
}

describe('checkBufferDays (SCRUM-298, PBI-23 AC 20)', () => {
  it.each([1, 5, 14])('takes %i days', (bufferDays) => {
    expect(checkBufferDays({ bufferDays })).toBe(bufferDays);
  });

  // The prototype's words for an empty field.
  it.each([
    ['no body', undefined],
    ['an empty body', {}],
    ['a null value', { bufferDays: null }],
  ])('asks for the buffer when given %s', (_name, body) => {
    expect(errorsOf(body)).toEqual({
      message: 'Data buffer deadline tidak valid',
      errors: { bufferDays: 'Isi buffer deadline' },
    });
  });

  // Only a JSON whole number from 1 to 14 is a buffer (OWASP A05:2025): nothing is coerced.
  it.each([
    ['0', 0],
    ['15', 15],
    ['a fraction', 4.5],
    ['a negative number', -5],
    ['text holding a number', '5'],
    ['text in exponent form', '5e0'],
    ['injected text', '5; drop table deadline_buffer'],
    ['a boolean', true],
    ['a list', [5]],
    ['an object', { value: 5 }],
  ])('refuses %s', (_name, bufferDays) => {
    expect(errorsOf({ bufferDays })).toEqual({
      message: 'Data buffer deadline tidak valid',
      errors: { bufferDays: 'Isi angka bulat 1–14' },
    });
  });

  // The body changes the buffer and nothing else, so no other column can ride along.
  it('refuses any other field', () => {
    expect(errorsOf({ bufferDays: 5, updated_by: 'someone' })).toEqual({
      message: 'Data buffer deadline tidak valid',
      errors: { body: 'Hanya buffer deadline yang bisa diubah' },
    });
  });

  it.each([
    ['a list', [{ bufferDays: 5 }]],
    ['text', '5'],
    ['null', null],
  ])('refuses %s as the body', (_name, body) => {
    expect(errorsOf(body)).toEqual({
      message: 'Data buffer deadline tidak valid',
      errors: { bufferDays: 'Isi buffer deadline' },
    });
  });
});
