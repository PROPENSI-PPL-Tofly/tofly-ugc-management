// What the bulk export writes: a small real xlsx (OOXML in a ZIP), answered as the file itself.
// Every figure comes from ExportSource, which the reader fills from the invoice's snapshot.
import type { ZipEntry } from './zip-archive.js';

/** One invoice as the database can give it to the exporter, before display formatting. */
export interface ExportSource {
  id: string;
  status: string;
  /** The number issued at finalize, the one its PDF carries; null for an older invoice without one. */
  invoiceNumber: string | null;
  creatorName: string;
  creatorEmail: string;
  period: number;
  contractPeriod: string;
  fixedRate: number | null;
  additionalContent: number | null;
  performanceBonus: number | null;
  penalty: number | null;
  adjustments: readonly {
    reason: string;
    amount: number;
    /** PBI-32: the admin corrected this line, so the export must say so. */
    corrected: boolean;
  }[];
  total: number;
  /** Jakarta days (YYYY-MM-DD), the day the admin and the creator saw the move happen. */
  finalizedAt: string | null;
  acknowledgedAt: string | null;
  paidAt: string | null;
}

/** One row of the recap sheet. */
export interface ExportLine {
  invoiceNumber: string;
  creatorName: string;
  creatorEmail: string;
  period: number;
  contractPeriod: string;
  status: string;
  components: string;
  adjustments: string;
  total: number;
  finalizedAt: string | null;
  acknowledgedAt: string | null;
  paidAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  accruing: 'Berjalan',
  finalized: 'Invoice Terkirim',
  creator_acked: 'Di-ack Creator',
  payment_uploaded: 'Bukti Bayar Terkirim',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const HEADERS = [
  'No Invoice',
  'Nama Creator',
  'Email',
  'Periode',
  'Periode Kontrak',
  'Status',
  'Komponen',
  'Penyesuaian',
  'Total',
  'Finalisasi',
  'Di-ack',
  'Dibayar',
];

/** Running invoices have no frozen amount; a cancelled one is never paid. */
export function isSkippable(status: string): boolean {
  return status === 'accruing' || status === 'cancelled';
}

/** The Rupiah form the invoices screen uses, including a minus before the Rp. */
export function formatRupiah(amount: number): string {
  const digits = new Intl.NumberFormat('id-ID').format(Math.abs(amount));
  return amount < 0 ? `-Rp${digits}` : `Rp${digits}`;
}

function money(amount: number | null): string {
  return amount === null ? 'Menunggu data' : formatRupiah(amount);
}

/** The snapshot keeps a penalty as a positive amount; every screen shows it as a deduction. */
function deduction(amount: number | null): number | null {
  return amount === null || amount === 0 ? amount : -Math.abs(amount);
}

/** The screen's snapshot is the only source: no component is recomputed here. */
export function toExportLine(source: ExportSource): ExportLine {
  return {
    invoiceNumber: source.invoiceNumber ?? '-',
    creatorName: source.creatorName,
    creatorEmail: source.creatorEmail,
    period: source.period,
    contractPeriod: source.contractPeriod,
    status: STATUS_LABELS[source.status] ?? source.status,
    components: [
      `Fixed Rate: ${money(source.fixedRate)}`,
      `Fee Konten Tambahan: ${money(source.additionalContent)}`,
      `Bonus Performa: ${money(source.performanceBonus)}`,
      `Penalti: ${money(deduction(source.penalty))}`,
    ].join('; '),
    adjustments:
      source.adjustments.length === 0
        ? '-'
        : source.adjustments
            .map(
              ({ reason, amount, corrected }) =>
                `${reason}${corrected ? ' (Diubah Admin)' : ''}: ${formatRupiah(amount)}`,
            )
            .join('; '),
    total: source.total,
    finalizedAt: source.finalizedAt,
    acknowledgedAt: source.acknowledgedAt,
    paidAt: source.paidAt,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function numberCell(reference: string, value: number): string {
  return `<c r="${reference}"><v>${value}</v></c>`;
}

function column(index: number): string {
  return String.fromCharCode(65 + index);
}

/** One worksheet: a header row and one row per exported invoice. */
export function sheetXml(lines: readonly ExportLine[]): string {
  const rows = [
    `<row r="1">${HEADERS.map((name, index) => textCell(`${column(index)}1`, name)).join('')}</row>`,
  ];

  lines.forEach((line, index) => {
    const row = index + 2;
    const cells = [
      textCell(`A${row}`, line.invoiceNumber),
      textCell(`B${row}`, line.creatorName),
      textCell(`C${row}`, line.creatorEmail),
      textCell(`D${row}`, String(line.period)),
      textCell(`E${row}`, line.contractPeriod),
      textCell(`F${row}`, line.status),
      textCell(`G${row}`, line.components),
      textCell(`H${row}`, line.adjustments),
      numberCell(`I${row}`, line.total),
      textCell(`J${row}`, line.finalizedAt ?? '-'),
      textCell(`K${row}`, line.acknowledgedAt ?? '-'),
      textCell(`L${row}`, line.paidAt ?? '-'),
    ];
    rows.push(`<row r="${row}">${cells.join('')}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

/** The five parts Excel needs to open a sheet as an xlsx workbook. */
export function xlsxFiles(lines: readonly ExportLine[]): ZipEntry[] {
  return [
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Rekap Invoice" sheetId="1" r:id="rId1"/></sheets>' +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml(lines) },
  ];
}
