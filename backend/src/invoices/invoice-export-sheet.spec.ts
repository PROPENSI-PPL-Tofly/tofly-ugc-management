import {
  formatRupiah,
  invoiceNumber,
  isSkippable,
  sheetXml,
  toExportLine,
  xlsxFiles,
  type ExportSource,
} from './invoice-export-sheet.js';

const TODAY = new Date('2026-07-20T00:00:00.000Z');

const SOURCE: ExportSource = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'finalized',
  creatorName: 'Budi & Santoso',
  creatorEmail: 'budi@example.com',
  period: 3,
  contractPeriod: '2026-07-01 s.d. 2026-07-31',
  fixedRate: 1_250_000,
  additionalContent: 200_000,
  performanceBonus: 50_000,
  penalty: null,
  adjustments: [
    { reason: 'Konten tambahan <extra>', amount: 25_000, corrected: true },
    { reason: 'Lain', amount: -10_000, corrected: false },
  ],
  total: 1_515_000,
  finalizedAt: '2026-07-15T07:00:00.000Z',
  acknowledgedAt: '2026-07-16T07:00:00.000Z',
  paidAt: null,
};

describe('bulk export sheet (31.4)', () => {
  it('formats Rupiah the way the screen does', () => {
    expect(formatRupiah(1_250_000)).toBe('Rp1.250.000');
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(-250)).toBe('-Rp250');
  });

  it('numbers an invoice TOF-INV-YYYYMM-NNN', () => {
    expect(invoiceNumber('2026-07-15T07:00:00.000Z', 3, TODAY)).toBe(
      'TOF-INV-202607-003',
    );
    expect(invoiceNumber(null, 12, TODAY)).toBe('TOF-INV-202607-012');
  });

  it.each(['accruing', 'cancelled'])('skips a %s invoice', (status) => {
    expect(isSkippable(status)).toBe(true);
  });

  it.each(['finalized', 'creator_acked', 'payment_uploaded', 'paid', 'unknown'])(
    'keeps a %s invoice',
    (status) => {
      expect(isSkippable(status)).toBe(false);
    },
  );

  it('reads every amount from the frozen snapshot, and marks admin corrections', () => {
    const line = toExportLine(SOURCE, 1, TODAY);
    expect(line).toEqual({
      invoiceNumber: 'TOF-INV-202607-001',
      creatorName: 'Budi & Santoso',
      creatorEmail: 'budi@example.com',
      period: 3,
      contractPeriod: SOURCE.contractPeriod,
      status: 'Invoice Terkirim',
      components:
        'Fixed Rate: Rp1.250.000; Fee Konten Tambahan: Rp200.000; Bonus Performa: Rp50.000; Penalti: Menunggu data',
      adjustments:
        'Konten tambahan <extra> (Diubah Admin): Rp25.000; Lain: -Rp10.000',
      total: 1_515_000,
      finalizedAt: SOURCE.finalizedAt,
      acknowledgedAt: SOURCE.acknowledgedAt,
      paidAt: null,
    });
  });

  it('names a status the app does not know without inventing a translation', () => {
    expect(toExportLine({ ...SOURCE, status: 'unknown' }, 1, TODAY).status).toBe(
      'unknown',
    );
  });

  it('escapes XML in a name or a reason', () => {
    const xml = sheetXml([toExportLine(SOURCE, 1, TODAY)]);
    expect(xml).toContain('Budi &amp; Santoso');
    expect(xml).not.toContain('Budi & Santoso');
    expect(xml).toContain('&lt;extra&gt;');
  });

  it('writes one numeric total cell and a dashed cell for an absent date', () => {
    const xml = sheetXml([toExportLine(SOURCE, 1, TODAY)]);
    expect(xml).toContain('<v>1515000</v>');
    expect(xml).toContain('<t>-</t>');
  });

  it('assembles the five OOXML parts of a real xlsx', () => {
    const files = xlsxFiles([toExportLine(SOURCE, 1, TODAY)], TODAY);
    expect(files.map(({ name }) => name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(files[0].content).toContain(
      'spreadsheetml.sheet.main+xml',
    );
    expect(files[2].content).toContain('r:id="rId1"');
    expect(files[3].content).toContain('worksheets/sheet1.xml');
    expect(files[4].content).toContain('TOF-INV-202607-001');
  });

  it('dashes an unfrozen date instead of writing a fabricated timestamp', () => {
    const line = toExportLine({ ...SOURCE, finalizedAt: null }, 1, TODAY);
    expect(line.invoiceNumber).toBe('TOF-INV-202607-001');
    expect(sheetXml([line])).toContain('<t>-</t>');
  });

  it('still writes an empty sheet when every selected invoice was skipped', () => {
    const files = xlsxFiles([], TODAY);
    expect(files[4].content).toContain('No Invoice');
    expect(files[4].content).not.toContain('<row r="2">');
  });
});
