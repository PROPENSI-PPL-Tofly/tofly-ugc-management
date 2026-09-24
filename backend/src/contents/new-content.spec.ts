import { UnprocessableEntityException } from '@nestjs/common';
import { checkNewContent } from './new-content.js';

describe('checkNewContent', () => {
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
