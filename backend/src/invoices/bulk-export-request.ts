import { UnprocessableEntityException } from '@nestjs/common';

/** One ZIP request carries a page's worth of invoices and never more than this. */
export const MAX_BULK_EXPORT_IDS = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The body of POST /invoices/bulk-export. Statuses, amounts and filenames are the server's;
 * the client only names the invoices it wants.
 */
export function checkBulkExportRequest(body: unknown): string[] {
  const errors: Record<string, string> = {};

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid({ body: 'Data ekspor tidak valid' });
  }

  const input = body as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (key !== 'invoiceIds') errors[key] = 'Field ini tidak dapat dikirim';
  }

  const ids = input.invoiceIds;
  if (ids === undefined) {
    errors.invoiceIds = 'Daftar invoice wajib diisi';
  } else if (!Array.isArray(ids)) {
    errors.invoiceIds = 'Daftar invoice harus berupa daftar';
  } else if (ids.length === 0 || ids.length > MAX_BULK_EXPORT_IDS) {
    errors.invoiceIds = 'Pilih antara 1 sampai 50 invoice';
  } else if (!ids.every((id) => typeof id === 'string' && UUID.test(id))) {
    errors.invoiceIds = 'Setiap invoice harus memiliki ID yang valid';
  } else if (new Set(ids).size !== ids.length) {
    errors.invoiceIds = 'Invoice tidak boleh diulang';
  }

  if (Object.keys(errors).length > 0) throw invalid(errors);

  return ids as string[];
}

function invalid(errors: Record<string, string>): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data ekspor tidak valid',
    errors,
  });
}
