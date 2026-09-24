import { UnprocessableEntityException } from '@nestjs/common';
import { checkNewContent } from './new-content.js';
 
describe('checkNewContent', () => { 
  it.each(['evergreen', 'specific'])('accepts the %s content type', (type) => {
    expect(() =>
      checkNewContent({
        type,
        deadline: '2026-10-10',
        name: 'Product launch',
        brief: 'Introduce the new product and its main features.',
      }),
    ).not.toThrow();
  });

  it.each(['other', 'Evergreen', 'Specific', ' evergreen ', 'scheduled'])(
    'rejects unsupported content type %j',
    (type) => {
      expect(() =>
        checkNewContent({ type, deadline: '2026-10-10' }),
      ).toThrow(
        expect.objectContaining({
          status: 422,
          response: expect.objectContaining({
            errors: expect.objectContaining({
              type: 'Jenis konten harus evergreen atau specific',
            }),
          }),
        }),
      );
    },
  );

  it('reports both required fields when the body is empty', () => {
    expect(() => checkNewContent({})).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({
            type: 'Jenis konten wajib dipilih',
            deadline: 'Tanggal deadline wajib diisi',
          }),
        }),
      }),
    );
  });

  it.each([
    ['type', undefined, 'Jenis konten wajib dipilih'],
    ['type', '', 'Jenis konten wajib dipilih'],
    ['type', '   ', 'Jenis konten wajib dipilih'],
    ['deadline', undefined, 'Tanggal deadline wajib diisi'],
    ['deadline', '', 'Tanggal deadline wajib diisi'],
    ['deadline', '   ', 'Tanggal deadline wajib diisi'],
  ])('requires %s when its value is %j', (field, value, message) => {
    const body = {
      type: 'evergreen',
      deadline: '2026-10-10',
      [field]: value,
    };

    expect(() => checkNewContent(body)).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({ [field]: message }),
        }),
      }),
    );
  });

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
