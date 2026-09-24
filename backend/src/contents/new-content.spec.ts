import { UnprocessableEntityException } from '@nestjs/common';
import { checkNewContent } from './new-content.js';
 
describe('checkNewContent', () => { 
  it.each([
    ['missing body', undefined],
    ['array', []],
    ['string', 'specific'],
    ['number', 42],
    ['boolean', true],
  ])('rejects a %s with field-level validation errors', (_label, input) => {
    expect(() => checkNewContent(input)).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({
            type: expect.any(String),
            deadline: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('rejects a null request body with field-level validation errors', () => {
    expect(() => checkNewContent(null)).toThrow(
      UnprocessableEntityException,
    );
    expect(() => checkNewContent(null)).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({
            type: expect.any(String),
            deadline: expect.any(String),
          }),
        }),
      }),
    );
  });
});
