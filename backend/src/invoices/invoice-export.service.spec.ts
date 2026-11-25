import { inflateRawSync } from 'node:zlib';
import { InvoiceExportService, type InvoiceExportReader } from './invoice-export.service.js';
import type { ExportSource } from './invoice-export-sheet.js';

const TODAY = new Date('2026-07-20T00:00:00.000Z');

function source(id: string, status: string): ExportSource {
  return {
    id,
    status,
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
    finalizedAt: '2026-07-15T07:00:00.000Z',
    acknowledgedAt: null,
    paidAt: null,
  };
}

function readEntries(archive: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const compressed = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    entries.set(
      name,
      inflateRawSync(archive.subarray(start, start + compressed), { finishFlush: 4 }),
    );
    offset = start + compressed;
  }
  return entries;
}

function readWorkbook(xlsx: Buffer): string {
  const parts = new Map<string, string>();
  let offset = 0;
  while (xlsx.readUInt32LE(offset) === 0x04034b50) {
    const compressed = xlsx.readUInt32LE(offset + 18);
    const nameLength = xlsx.readUInt16LE(offset + 26);
    const extraLength = xlsx.readUInt16LE(offset + 28);
    const name = xlsx.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    parts.set(
      name,
      inflateRawSync(xlsx.subarray(start, start + compressed), { finishFlush: 4 }).toString('utf8'),
    );
    offset = start + compressed;
  }
  expect(parts.has('xl/worksheets/sheet1.xml')).toBe(true);
  return parts.get('xl/worksheets/sheet1.xml')!;
}

describe('InvoiceExportService (31.4)', () => {
  it('streams a ZIP whose xlsx holds only the finalized-or-later invoices', async () => {
    const read = vi.fn().mockResolvedValue([
      source('running-id', 'accruing'),
      source('final-id', 'finalized'),
      source('paid-id', 'paid'),
    ]);
    const service = new InvoiceExportService({ read } as InvoiceExportReader);

    const result = await service.export(['running-id', 'final-id', 'paid-id'], TODAY);

    expect(read).toHaveBeenCalledWith(['running-id', 'final-id', 'paid-id']);
    expect(result.exported).toBe(2);
    expect(result.skipped).toEqual([
      { id: 'running-id', reason: 'Berjalan' },
    ]);
    expect(result.filename).toBe('Rekap_Invoice_20260720.zip');
    const outer = readEntries(result.archive);
    expect([...outer.keys()]).toEqual(['Rekap_Invoice_20260720.xlsx']);
    const sheet = readWorkbook(outer.get('Rekap_Invoice_20260720.xlsx')!);
    expect(sheet).toContain('TOF-INV-202607-001');
    expect(sheet).toContain('TOF-INV-202607-002');
    expect(sheet).not.toContain('running-id');
    expect(sheet).toContain('<v>1250000</v>');
  });

  it('lists a Cancelled invoice as skipped with its own reason', async () => {
    const service = new InvoiceExportService({
      read: vi.fn().mockResolvedValue([source('cancelled-id', 'cancelled')]),
    } as InvoiceExportReader);

    const result = await service.export(['cancelled-id'], TODAY);

    expect(result.exported).toBe(0);
    expect(result.skipped).toEqual([
      { id: 'cancelled-id', reason: 'Cancelled' },
    ]);
    const sheet = readWorkbook(
      readEntries(result.archive).get('Rekap_Invoice_20260720.xlsx')!,
    );
    expect(sheet).not.toContain('<row r="2">');
  });

  it('passes a reader failure through instead of returning an empty archive', async () => {
    const service = new InvoiceExportService({
      read: vi.fn().mockRejectedValue(new Error('database down')),
    } as InvoiceExportReader);
    await expect(service.export(['final-id'], TODAY)).rejects.toThrow('database down');
  });
});
