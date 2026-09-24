import { UnprocessableEntityException } from '@nestjs/common';
import { checkNewContent } from './new-content.js';

describe('checkNewContent', () => {
  const VALID_CONTRACT_ID = '550e8400-e29b-41d4-a716-446655440000';

  describe('Specific content fields', () => {
    describe.each([
      ['name', 'Nama konten wajib diisi'],
      ['brief', 'Brief wajib diisi'],
    ])('requires text for %s', (field, message) => {
      it.each(
        [undefined, null, '', '   ', 42, true, [], {}].map((value) => ({
          value,
        })),
      )('rejects value $value', ({ value }) => {
        const body = {
          contractId: VALID_CONTRACT_ID,
          type: 'specific',
          deadline: '2026-10-10',
          name: 'Product launch',
          brief: 'Introduce the new product.',
          [field]: value,
        };

        expect(() => checkNewContent(body)).toThrow(
          expect.objectContaining({
            status: 422,
            response: expect.objectContaining({
              errors: expect.objectContaining({
                [field]: message,
              }),
            }),
          }),
        );
      });
    });

    it('reports name and brief errors together when both are missing', () => {
      expect(() =>
        checkNewContent({
          contractId: VALID_CONTRACT_ID,
          type: 'specific',
          deadline: '2026-10-10',
        }),
      ).toThrow(
        expect.objectContaining({
          status: 422,
          response: expect.objectContaining({
            errors: expect.objectContaining({
              name: 'Nama konten wajib diisi',
              brief: 'Brief wajib diisi',
            }),
          }),
        }),
      );
    });

    it('allows Evergreen content without a name or brief', () => {
      expect(() =>
        checkNewContent({
          contractId: VALID_CONTRACT_ID,
          type: 'evergreen',
          deadline: '2026-10-10',
        }),
      ).not.toThrow();
    });
  });

  it.each(['evergreen', 'specific'])('accepts the %s content type', (type) => {
    expect(() =>
      checkNewContent({
        contractId: VALID_CONTRACT_ID,
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
        checkNewContent({
          contractId: VALID_CONTRACT_ID,
          type,
          deadline: '2026-10-10',
        }),
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
            contractId: 'Kontrak wajib dipilih',
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
      contractId: VALID_CONTRACT_ID,
      type: 'evergreen',
      deadline: '2026-10-10',
      [field]: value,
    };

    expect(() => checkNewContent(body)).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({
            [field]: message,
          }),
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
            contractId: expect.any(String),
            type: expect.any(String),
            deadline: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('rejects a null request body with field-level validation errors', () => {
    expect(() => checkNewContent(null)).toThrow(UnprocessableEntityException);

    expect(() => checkNewContent(null)).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({
            contractId: expect.any(String),
            type: expect.any(String),
            deadline: expect.any(String),
          }),
        }),
      }),
    );
  });

  it.each([
    'not-a-date',
    '2026/10/10',
    '10-10-2026',
    '2026-02-30',
    '2026-13-10',
  ])('rejects invalid deadline %j', (deadline) => {
    expect(() =>
      checkNewContent({
        contractId: VALID_CONTRACT_ID,
        type: 'evergreen',
        deadline,
      }),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({
            deadline: 'Format tanggal deadline tidak valid',
          }),
        }),
      }),
    );
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['number', 42],
    ['invalid UUID', 'not-a-uuid'],
  ])('rejects a %s contractId', (_label, contractId) => {
    expect(() =>
      checkNewContent({
        contractId,
        type: 'evergreen',
        deadline: '2026-10-10',
      }),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        response: expect.objectContaining({
          errors: expect.objectContaining({
            contractId: expect.any(String),
          }),
        }),
      }),
    );
  });
});
