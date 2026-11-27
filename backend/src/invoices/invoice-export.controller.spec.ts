import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StreamableFile } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { checkBulkExportRequest } from './bulk-export-request.js';
import { InvoiceExportController } from './invoice-export.controller.js';
import { InvoiceExportService } from './invoice-export.service.js';

const ID = '11111111-1111-4111-8111-111111111111';

describe('InvoiceExportController (31.4)', () => {
  it('is behind the admin guard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, InvoiceExportController),
    ).toContain(AdminGuard);
  });

  it('validates the body and streams the xlsx as an attachment', async () => {
    const exportPdf = vi.fn().mockResolvedValue({
      workbook: Buffer.from('PK'),
      exported: 1,
      skipped: [],
      filename: 'Rekap_Invoice_20260720.xlsx',
    });
    const controller = new InvoiceExportController({
      export: exportPdf,
    } as unknown as InvoiceExportService);

    const result = await controller.bulkExport(
      { invoiceIds: [ID] },
      { principal: { userId: 'admin-1', role: 'admin' } },
    );

    expect(exportPdf).toHaveBeenCalledWith([ID], expect.any(Date));
    expect(result).toBeInstanceOf(StreamableFile);
    const options = (result as unknown as { options: Record<string, string> })
      .options;
    expect(options.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(options.disposition).toContain('Rekap_Invoice_20260720.xlsx');
  });

  it('refuses a caller without an admin principal before reading anything', async () => {
    const exportPdf = vi.fn();
    const controller = new InvoiceExportController({
      export: exportPdf,
    } as unknown as InvoiceExportService);

    await expect(
      controller.bulkExport({ invoiceIds: [ID] }, { principal: undefined }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(exportPdf).not.toHaveBeenCalled();
  });

  it('rejects a bad body through the same boundary check the endpoint uses', () => {
    expect(() => checkBulkExportRequest({ invoiceIds: [] })).toThrow();
  });
});
