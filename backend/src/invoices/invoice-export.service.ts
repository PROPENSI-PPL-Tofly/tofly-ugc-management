import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { jakartaDay } from '../creators/evergreen.js';
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
  /** The xlsx itself (an xlsx is already a ZIP, so it is not wrapped again). */
  workbook: Buffer;
  exported: number;
  skipped: SkippedInvoice[];
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

  /** One xlsx recap, in the order the admin ticked the rows, named after the Jakarta day. */
  async export(
    ids: readonly string[],
    today = new Date(),
  ): Promise<ExportResult> {
    const sources = await this.reader.read(ids);
    const kept = sources.filter((source) => !isSkippable(source.status));
    if (kept.length === 0) {
      // A file with only a header row would read as a successful download of nothing.
      throw new UnprocessableEntityException({
        code: 'INVOICE_EXPORT_EMPTY',
        message: 'Tidak ada invoice yang bisa diunduh.',
      });
    }

    const skipped = sources
      .filter((source) => isSkippable(source.status))
      .map((source) => ({
        id: source.id,
        reason: SKIP_LABELS[source.status],
      }));

    const day = jakartaDay(today).replace(/-/g, '');
    return {
      workbook: zipFiles(xlsxFiles(kept.map(toExportLine))),
      exported: kept.length,
      skipped,
      filename: `Rekap_Invoice_${day}.xlsx`,
    };
  }
}
