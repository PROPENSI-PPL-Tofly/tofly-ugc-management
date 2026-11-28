import { Inject, Injectable } from '@nestjs/common';
import { jakartaDay } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ExportSource } from './invoice-export-sheet.js';
import { creatorName, savedSnapshot, INVOICE_SELECT } from './invoice-rows.js';
import type { InvoiceExportReader } from './invoice-export.service.js';

type ExportClient = Pick<PrismaService, 'invoices'>;

/** A move's Jakarta day, the date the rest of the app shows for it. */
function dayOf(at: Date | null): string | null {
  return at ? jakartaDay(at) : null;
}

/** Loads exactly the selected saved invoices. Their snapshot is the figure the screen showed. */
@Injectable()
export class PrismaInvoiceExportReader implements InvoiceExportReader {
  constructor(@Inject(PrismaService) private readonly prisma: ExportClient) {}

  async read(ids: readonly string[]): Promise<ExportSource[]> {
    const rows = await this.prisma.invoices.findMany({
      // A ticked row names its contract; a saved invoice id works too (the 31.4 wording).
      where: {
        OR: [{ id: { in: [...ids] } }, { contract_id: { in: [...ids] } }],
      },
      select: {
        id: true,
        status: true,
        invoice_number: true,
        snapshot: true,
        finalized_at: true,
        acknowledged_at: true,
        paid_at: true,
        contracts: {
          select: {
            id: true,
            start_date: true,
            end_date: true,
            creators: {
              select: {
                ...INVOICE_SELECT,
                users: { select: { email: true } },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      const { id, start_date, end_date, creators } = row.contracts;
      const snapshot = savedSnapshot(row.snapshot);
      const ordered = [...creators.contracts].sort(
        (a, b) => a.start_date.getTime() - b.start_date.getTime(),
      );

      return {
        id: row.id,
        // No frozen breakdown means there is nothing an invoice could be paid from yet.
        status: snapshot ? row.status : 'accruing',
        invoiceNumber: row.invoice_number,
        creatorName: creatorName(creators),
        creatorEmail: creators.users.email,
        period: ordered.findIndex((contract) => contract.id === id) + 1,
        contractPeriod: `${start_date.toISOString().slice(0, 10)} s.d. ${end_date.toISOString().slice(0, 10)}`,
        fixedRate: snapshot?.fixedRate.amount ?? null,
        additionalContent: snapshot?.additionalContent.amount ?? null,
        performanceBonus: snapshot?.performanceBonus.amount ?? null,
        penalty: snapshot?.penalty.amount ?? null,
        adjustments: (snapshot?.adjustments ?? []).map((adjustment) => ({
          reason: adjustment.reason,
          amount: adjustment.amount,
          // Manual adjustments can only be made by an admin (InvoiceCommandService).
          corrected: true,
        })),
        total: snapshot?.total ?? 0,
        finalizedAt: dayOf(row.finalized_at),
        acknowledgedAt: dayOf(row.acknowledged_at),
        paidAt: dayOf(row.paid_at),
      };
    });
  }
}
