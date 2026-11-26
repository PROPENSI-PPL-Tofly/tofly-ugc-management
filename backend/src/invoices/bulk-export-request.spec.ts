import { UnprocessableEntityException } from '@nestjs/common';
import { MAX_BULK_EXPORT_IDS, checkBulkExportRequest } from './bulk-export-request.js';

const ID = '11111111-1111-4111-8111-111111111111';

function invalid(body: unknown): Record<string, string> {
  try {
    checkBulkExportRequest(body);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const response = (error as UnprocessableEntityException).getResponse() as {
      errors: Record<string, string>;
    };
    return response.errors;
  }
  throw new Error('Expected checkBulkExportRequest to reject the request');
}

describe('checkBulkExportRequest (31.4)', () => {
  it('accepts one to fifty distinct invoice ids', () => {
    expect(checkBulkExportRequest({ invoiceIds: [ID] })).toEqual([ID]);
    expect(
      checkBulkExportRequest({
        invoiceIds: Array.from(
          { length: MAX_BULK_EXPORT_IDS },
          (_, index) =>
            `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
        ),
      }),
    ).toHaveLength(MAX_BULK_EXPORT_IDS);
  });

  it.each([
    ['null', null],
    ['an array', [ID]],
    ['a string', ID],
  ])('rejects a body that is %s', (_label, body) => {
    expect(invalid(body).body).toBe('Data ekspor tidak valid');
  });

  it('rejects unknown fields, so a client cannot choose status or amounts', () => {
    expect(invalid({ invoiceIds: [ID], status: 'paid' }).status).toBe(
      'Field ini tidak dapat dikirim',
    );
  });

  it('rejects a missing or non-array invoiceIds', () => {
    expect(invalid({}).invoiceIds).toBe('Daftar invoice wajib diisi');
    expect(invalid({ invoiceIds: ID }).invoiceIds).toBe(
      'Daftar invoice harus berupa daftar',
    );
  });

  it('rejects an empty list and a list past the fifty-id limit', () => {
    expect(invalid({ invoiceIds: [] }).invoiceIds).toBe(
      'Pilih antara 1 sampai 50 invoice',
    );
    expect(
      invalid({
        invoiceIds: Array.from(
          { length: MAX_BULK_EXPORT_IDS + 1 },
          (_, index) => `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
        ),
      }).invoiceIds,
    ).toBe('Pilih antara 1 sampai 50 invoice');
  });

  it('rejects an id that is not a UUID', () => {
    expect(invalid({ invoiceIds: [ID, 'not-an-id'] }).invoiceIds).toBe(
      'Setiap invoice harus memiliki ID yang valid',
    );
  });

  it('rejects the same invoice twice', () => {
    expect(invalid({ invoiceIds: [ID, ID] }).invoiceIds).toBe(
      'Invoice tidak boleh diulang',
    );
  });
});
