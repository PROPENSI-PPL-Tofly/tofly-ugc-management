import { inflateRawSync } from 'node:zlib';
import { UnprocessableEntityException } from '@nestjs/common';
import {
  InvoiceExportService,
  type InvoiceExportReader,
} from './invoice-export.service.js';
import type { ExportSource } from './invoice-export-sheet.js';

// 01:00 on 20 July in Jakarta while it is still the 19th in UTC: the file is named after Jakarta.
const TODAY = new Date('2026-07-19T18:00:00.000Z');

function source(
  id: string,
  status: string,
  invoiceNumber: string | null = null,
): ExportSource {
  return {
    id,
    status,
    invoiceNumber,
    creatorName: 'Budi Santoso',
    creatorEmail: 'budi@example.com',
    period: 2,
    contractPeriod: '2026-07-01 s.d. 2026-07-31',
    fixedRate: 1_250_000,
    additionalContent: 0,
    performanceBonus: 0,
    penalty: 0,
    adjustments: [],
    total: 1_250_000,
    finalizedAt: '2026-07-15',
    acknowledgedAt: null,
    paidAt: null,
  };
}

function readWorkbook(xlsx: Buffer): string {
  const parts = new Map<string, string>();
  let offset = 0;
  while (xlsx.readUInt32LE(offset) === 0x04034b50) {
    const compressed = xlsx.readUInt32LE(offset + 18);
    const nameLength = xlsx.readUInt16LE(offset + 26);
    const extraLength = xlsx.readUInt16LE(offset + 28);
    const name = xlsx
      .subarray(offset + 30, offset + 30 + nameLength)
      .toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    parts.set(
      name,
      inflateRawSync(xlsx.subarray(start, start + compressed), {
        finishFlush: 4,
      }).toString('utf8'),
    );
    offset = start + compressed;
  }
  expect(parts.has('xl/worksheets/sheet1.xml')).toBe(true);
  return parts.get('xl/worksheets/sheet1.xml')!;
}

describe('InvoiceExportService (31.4)', () => {
  it('answers one xlsx named after the Jakarta day, holding only finalized-or-later invoices', async () => {
    const read = vi
      .fn()
      .mockResolvedValue([
        source('running-id', 'accruing'),
        source('final-id', 'finalized', 'TOF-INV-202607-021'),
        source('paid-id', 'paid', 'TOF-INV-202607-004'),
      ]);
    const service = new InvoiceExportService({ read } as InvoiceExportReader);

    const result = await service.export(
      ['running-id', 'final-id', 'paid-id'],
      TODAY,
    );

    expect(read).toHaveBeenCalledWith(['running-id', 'final-id', 'paid-id']);
    expect(result.exported).toBe(2);
    expect(result.skipped).toEqual([{ id: 'running-id', reason: 'Berjalan' }]);
    expect(result.filename).toBe('Rekap_Invoice_20260720.xlsx');
    const sheet = readWorkbook(result.workbook);
    // The stored numbers, in the order ticked: the same numbers the PDFs carry.
    expect(sheet.indexOf('TOF-INV-202607-021')).toBeLessThan(
      sheet.indexOf('TOF-INV-202607-004'),
    );
    expect(sheet).not.toContain('running-id');
    expect(sheet).toContain('<v>1250000</v>');
  });

  it('refuses to make a file when every ticked invoice is skipped', async () => {
    const service = new InvoiceExportService({
      read: vi
        .fn()
        .mockResolvedValue([
          source('cancelled-id', 'cancelled'),
          source('running-id', 'accruing'),
        ]),
    } as InvoiceExportReader);

    const refusal = service.export(['cancelled-id', 'running-id'], TODAY);

    await expect(refusal).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(refusal).rejects.toMatchObject({
      response: {
        code: 'INVOICE_EXPORT_EMPTY',
        message: 'Tidak ada invoice yang bisa diunduh.',
      },
    });
  });

  it('refuses the same way when none of the ids names an invoice', async () => {
    const service = new InvoiceExportService({
      read: vi.fn().mockResolvedValue([]),
    } as InvoiceExportReader);
    await expect(service.export(['missing-id'], TODAY)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('passes a reader failure through instead of returning an empty file', async () => {
    const service = new InvoiceExportService({
      read: vi.fn().mockRejectedValue(new Error('database down')),
    } as InvoiceExportReader);
    await expect(service.export(['final-id'], TODAY)).rejects.toThrow(
      'database down',
    );
  });
});
