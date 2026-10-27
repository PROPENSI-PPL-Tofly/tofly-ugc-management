import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  InvoiceAdjustmentDto,
  InvoiceSnapshotDto,
} from './dto/invoice-list.dto.js';
import {
  CONTENT_SELECT,
  INVOICE_ADJUSTMENT_SELECT,
  adjustedTotals,
  adjustmentDto,
  sumAdjustments,
  toInvoiceContent,
  toInvoiceContract,
} from './invoice-rows.js';
import { invoiceState } from './invoice-lifecycle.js';
import type { ManualAdjustmentInput } from './manual-adjustment.js';
import { calculateInvoice } from './invoice-calculator.js';
import { contractLastDay } from './invoice-days.js';
import { settleForFinalize } from './invoice-settlement.js';
import type { FinalizeRequest } from './finalize-request.js';
import { RATE_FORMULA_SOURCE, type RateFormulaSource } from './rate-formula.js';

// The admin's commands on a running invoice (PBI-12): recording a manual adjustment and
// finalizing the invoice into its frozen snapshot. The reads stay in InvoicesService. This is
// Command Query Separation within the service layer only: there is no command bus and no
// separate read model, and both sides use the same tables. Each command locks the contract row
// first, inside one transaction, so the commands on one contract run one after the other.

/** The database operations the commands use. */
export type InvoiceCommandClient = Pick<
  PrismaService,
  | 'contracts'
  | 'invoices'
  | 'invoice_adjustments'
  | '$queryRaw'
  | '$transaction'
>;

/** What the controller needs to change an invoice. */
export interface InvoiceCommands {
  addAdjustment(
    contractId: string,
    input: ManualAdjustmentInput,
    actorUserId: string,
  ): Promise<InvoiceAdjustmentDto & { invoiceStatus: 'accruing' }>;

  finalize(
    contractId: string,
    finalizedBy: string,
    today?: Date,
    request?: FinalizeRequest,
  ): Promise<{
    invoiceStatus: 'finalized';
    adjustments: InvoiceAdjustmentDto[];
    snapshot: InvoiceSnapshotDto;
  }>;
}

/** A finalize with no body: the admin has not accepted freezing a pending performance bonus. */
const NO_PENDING_BONUS_ACCEPTED: Readonly<FinalizeRequest> = Object.freeze({
  acceptPendingBonus: false,
});

function codeError(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

@Injectable()
export class InvoiceCommandService implements InvoiceCommands {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoiceCommandClient,
    @Inject(RATE_FORMULA_SOURCE) private readonly formulas: RateFormulaSource,
  ) {}

  async addAdjustment(
    contractId: string,
    input: ManualAdjustmentInput,
    actorUserId: string,
  ): Promise<InvoiceAdjustmentDto & { invoiceStatus: 'accruing' }> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockContract(tx, contractId);
        await this.requireContract(tx, contractId);

        const invoice = await tx.invoices.upsert({
          where: { contract_id: contractId },
          create: { contract_id: contractId },
          update: {},
          select: { id: true, status: true },
        });

        invoiceState(invoice.status).assertCanAdjust();

        const saved = await tx.invoice_adjustments.create({
          data: {
            invoice_id: invoice.id,
            amount: new Prisma.Decimal(input.amount.toFixed(2)),
            reason: input.reason,
            actor_user_id: actorUserId,
          },
          select: INVOICE_ADJUSTMENT_SELECT,
        });

        // Still running in the database; the API names it as the pipeline does.
        return { ...adjustmentDto(saved), invoiceStatus: 'accruing' };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async finalize(
    contractId: string,
    /** The admin who freezes the invoice, from the session. */
    finalizedBy: string,
    today = new Date(),
    request: FinalizeRequest = NO_PENDING_BONUS_ACCEPTED,
  ): Promise<{
    invoiceStatus: 'finalized';
    adjustments: InvoiceAdjustmentDto[];
    snapshot: InvoiceSnapshotDto;
  }> {
    const formula = await this.formulas.current();

    return this.prisma.$transaction(
      async (tx) => {
        await this.lockContract(tx, contractId);

        const contract = await tx.contracts.findUnique({
          where: { id: contractId },
          select: {
            id: true,
            start_date: true,
            end_date: true,
            content_quota: true,
            fixed_rate: true,
            creators: { select: { access_revoke_date: true } },
            contents: {
              select: CONTENT_SELECT,
              orderBy: { deadline: 'asc' },
            },
          },
        });

        if (!contract) this.contractNotFound();

        const invoiceContract = toInvoiceContract(
          {
            id: contract.id,
            start_date: contract.start_date,
            end_date: contract.end_date,
            content_quota: contract.content_quota,
            fixed_rate: contract.fixed_rate,
          },
          contract.creators.access_revoke_date,
        );

        // An early end counts: the contract stops on the day access was revoked.
        if (jakartaDay(today) <= contractLastDay(invoiceContract)) {
          throw codeError('CONTRACT_NOT_ENDED', 'Kontrak belum berakhir');
        }

        const invoice = await tx.invoices.upsert({
          where: { contract_id: contractId },
          create: { contract_id: contractId },
          update: {},
          select: { id: true, status: true },
        });

        invoiceState(invoice.status).assertCanFinalize();

        const breakdown = calculateInvoice({
          contract: invoiceContract,
          contents: contract.contents.map(toInvoiceContent),
          formula,
          today,
        });

        const settled = settleForFinalize(
          breakdown,
          request.acceptPendingBonus,
        );

        const adjustmentRows = await tx.invoice_adjustments.findMany({
          where: { invoice_id: invoice.id },
          select: INVOICE_ADJUSTMENT_SELECT,
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        });

        const adjustments = adjustmentRows.map(adjustmentDto);

        // today is the request's instant, not a day: the breakdown is as of it, so it is when
        // the invoice was finalized.
        const snapshot: InvoiceSnapshotDto = {
          ...settled.components,
          adjustments,
          ...adjustedTotals(settled.rawTotal, sumAdjustments(adjustments)),
          finalizedAt: today.toISOString(),
          formula,
          performanceBonusPending: settled.performanceBonusPending,
        };

        const updated = await tx.invoices.updateMany({
          where: { id: invoice.id, status: 'running' },
          data: {
            status: 'finalized',
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            finalized_at: today,
            finalized_by: finalizedBy,
          },
        });

        if (updated.count !== 1) {
          throw codeError('INVOICE_FINALIZED', 'Invoice sudah difinalisasi');
        }

        return { invoiceStatus: 'finalized', adjustments, snapshot };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async lockContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`,
    );
  }

  private async requireContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<void> {
    const contract = await tx.contracts.findUnique({
      where: { id: contractId },
      select: { id: true },
    });

    if (!contract) this.contractNotFound();
  }

  private contractNotFound(): never {
    throw new NotFoundException({
      code: 'CONTRACT_NOT_FOUND',
      message: 'Kontrak tidak ditemukan',
    });
  }
}
