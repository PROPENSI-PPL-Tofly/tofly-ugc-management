import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditLogger } from '../audit/audit-logger.js';
import { joinName } from '../creators/evergreen.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AcknowledgedInvoiceDto,
  PaidInvoiceDto,
} from './dto/invoice-confirmation.dto.js';
import {
  invoiceState,
  type InvoiceLifecycleStatus,
  type InvoiceState,
} from './invoice-lifecycle.js';

// The creator's two moves on their own invoice (PBI-13, 13.1): acknowledging the amount the admin
// froze, and confirming the payment arrived. The admin's moves live elsewhere: finalizing in
// InvoiceCommandService (PBI-12), the payment proof in PaymentProofService (13.2).

/** The database operations this service uses. */
export type InvoiceConfirmationClient = Pick<
  PrismaService,
  'contracts' | 'invoices' | '$transaction'
>;

/** One move of the creator: the step it leaves, the step it reaches and what it records. */
interface CreatorMove {
  from: InvoiceLifecycleStatus;
  to: InvoiceLifecycleStatus;
  // What "Log Aktivitas" calls this move (PBI-23).
  auditAction: AuditAction;
  /** Whether the state the invoice is in allows the move; throws the reason when not. */
  allowedFrom(state: InvoiceState): void;
  /** The columns that keep who made the move and when. */
  stamp(
    actorUserId: string,
    at: Date,
  ): {
    acknowledged_at?: Date;
    acknowledged_by?: string;
    paid_at?: Date;
    paid_by?: string;
  };
}

const ACKNOWLEDGE: CreatorMove = {
  from: 'finalized',
  to: 'creator_acked',
  auditAction: 'invoice_acknowledged',
  allowedFrom: (state) => state.assertCanAcknowledge(),
  stamp: (actorUserId, at) => ({
    acknowledged_at: at,
    acknowledged_by: actorUserId,
  }),
};

const CONFIRM_RECEIPT: CreatorMove = {
  from: 'payment_uploaded',
  to: 'paid',
  auditAction: 'payment_confirmed',
  allowedFrom: (state) => state.assertCanConfirmReceipt(),
  stamp: (actorUserId, at) => ({ paid_at: at, paid_by: actorUserId }),
};

@Injectable()
export class InvoiceConfirmationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: InvoiceConfirmationClient,
    @Optional()
    @Inject(AuditLogger)
    private readonly audit: AuditLogger = new AuditLogger(),
  ) {}

  /** The creator accepts the frozen amount: Finalized → Acknowledged. */
  async acknowledge(
    contractId: string,
    creatorId: string,
    now = new Date(),
  ): Promise<AcknowledgedInvoiceDto> {
    await this.move(ACKNOWLEDGE, contractId, creatorId, now);
    return {
      invoiceStatus: 'creator_acked',
      acknowledgedAt: now.toISOString(),
    };
  }

  /** The creator says the payment arrived: Payment Proof Uploaded → Paid. */
  async confirmReceipt(
    contractId: string,
    creatorId: string,
    now = new Date(),
  ): Promise<PaidInvoiceDto> {
    await this.move(CONFIRM_RECEIPT, contractId, creatorId, now);
    return { invoiceStatus: 'paid', paidAt: now.toISOString() };
  }

  /**
   * Checks the contract is the creator's, asks the invoice's state whether the move is allowed,
   * then moves it with one update guarded on the status it was read in: of two moves at once,
   * the second changes nothing and is told where the invoice now stands.
   */
  private async move(
    move: CreatorMove,
    contractId: string,
    creatorId: string,
    now: Date,
  ): Promise<void> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
      select: {
        creator_id: true,
        creators: {
          select: {
            user_id: true,
            first_name: true,
            middle_name: true,
            last_name: true,
          },
        },
        invoice: { select: { id: true, status: true } },
      },
    });

    if (!contract) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice tidak ditemukan',
      });
    }
    if (contract.creator_id !== creatorId) {
      throw new ForbiddenException({
        code: 'INVOICE_ACCESS_DENIED',
        message: 'Akses ditolak',
      });
    }

    // A contract nobody has adjusted or finalized has no invoice row yet: it is still running.
    move.allowedFrom(invoiceState(contract.invoice?.status ?? 'running'));

    // Both moves start from a status only a saved invoice row can have, so the row exists here.
    const invoiceId = contract.invoice!.id;
    const creatorName = joinName(contract.creators);

    // The move and its entry land or fail together (PBI-23, OWASP A09:2025).
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.invoices.updateMany({
        where: { contract_id: contractId, status: move.from },
        data: {
          status: move.to,
          ...move.stamp(contract.creators.user_id, now),
        },
      });

      if (moved.count !== 1) {
        const current = await tx.invoices.findUnique({
          where: { contract_id: contractId },
          select: { status: true },
        });
        move.allowedFrom(invoiceState(current?.status ?? 'running'));
        throw new ConflictException({
          code: 'INVOICE_STATUS_CHANGED',
          message: 'Status invoice berubah. Muat ulang lalu coba lagi.',
        });
      }

      await this.audit.record(tx, {
        actor: {
          userId: contract.creators.user_id,
          name: creatorName,
          role: 'creator',
        },
        action: move.auditAction,
        target: { id: invoiceId, label: `Invoice ${creatorName}` },
        creatorId,
        oldValues: { status: move.from },
        newValues: { status: move.to },
      });
    });
  }
}
