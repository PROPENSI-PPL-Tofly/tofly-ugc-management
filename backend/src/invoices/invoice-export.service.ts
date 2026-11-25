import { Inject, Injectable } from '@nestjs/common';
import {
  isSkippable,
  toExportLine,
  xlsxFiles,
  type ExportSource,
} from './invoice-export-sheet.js';
import { zipFiles } from './zip-archive.js';

/** Where the exporter gets the selected invoices; a port so it can be tested without a DB. */
export interface InvoiceExportReader {
  read(ids: readonly string[]): Promise<ExportSource[]>;
}

export const INVOICE_EXPORT_READER = Symbol('INVOICE_EXPORT_READER');

export interface SkippedInvoice {
  id: string;
  reason: string;
}

export interface ExportResult {
  archive: Buffer;
  exported: number;
  skipped: SkippedInvoice[];
  /** The attachment name; the ZIP contains one xlsx under the same day. */
  filename: string;
}

const SKIP_LABELS: Record<string, string> = {
  accruing: 'Berjalan',
  cancelled: 'Cancelled',
};

@Injectable()
export class InvoiceExportService {
  constructor(
    @Inject(INVOICE_EXPORT_READER)
    private readonly reader: InvoiceExportReader,
  ) {}

  /** One ZIP with one xlsx recap, in the order the admin ticked the rows. */
  async export(
    ids: readonly string[],
    today = new Date(),
  ): Promise<ExportResult> {
    const sources = await this.reader.read(ids);
    const kept = sources.filter((source) => !isSkippable(source.status));
    const skipped = sources
      .filter((source) => isSkippable(source.status))
      .map((source) => ({
        id: source.id,
        reason: SKIP_LABELS[source.status],
      }));

    const lines = kept.map((source, index) => toExportLine(source, index + 1, today));
    const day = today.toISOString().slice(0, 10).replace(/-/g, '');
    const sheetName = `Rekap_Invoice_${day}.xlsx`;
    const workbook = zipFiles(xlsxFiles(lines, today));
    const archive = zipFiles([{ name: sheetName, content: workbook }]);

    return {
      archive,
      exported: kept.length,
      skipped,
      filename: `Rekap_Invoice_${day}.zip`,
    };
  }
}
