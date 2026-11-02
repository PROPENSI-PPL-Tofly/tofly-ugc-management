import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, link_data_state, social_platform } from '@prisma/client';
import type { InvoiceLifecycleStatus } from '../invoices/invoice-lifecycle.js';
import { lockContractRow } from '../invoices/contract-lock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CONNECTION_SELECT,
  type ConnectionRow,
} from './account-connections.js';
import {
  EnterManualPerformance,
  type LinkPerformance,
} from './enter-manual-performance.js';
import {
  METRIC_NAMES,
  type PerformanceMetrics,
} from './manual-performance-input.js';

/** The content as one read inside the transaction finds it: its link and its account on a platform. */
export interface ManualContentRow {
  id: string;
  contract_id: string;
  contracts: {
    invoice: { status: InvoiceLifecycleStatus } | null;
    creators: {
      social_accounts: (ConnectionRow & { platform: social_platform })[];
    };
  };
  content_links: (PerformanceMetrics & {
    id: string;
    platform: social_platform | null;
    url: string;
    data_state: link_data_state;
    last_synced_at: Date | null;
  })[];
}

/** The slice of Prisma a manual entry uses, so unit tests stub exactly that. */
export interface ManualPerformanceTransaction {
  contents: { findFirst(args: unknown): Promise<ManualContentRow | null> };
  content_links: { updateMany(args: unknown): Promise<{ count: number }> };
  content_events: { create(args: unknown): Promise<unknown> };
  /** The contract row lock (contract-lock.ts), the same one Finalize takes first. */
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
}

export interface ManualPerformanceClient {
  $transaction<T>(
    work: (transaction: ManualPerformanceTransaction) => Promise<T>,
  ): Promise<T>;
}

const METRIC_SELECT = Object.fromEntries(
  METRIC_NAMES.map((name) => [name, true]),
) as Record<(typeof METRIC_NAMES)[number], true>;

function contentNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'CONTENT_NOT_FOUND',
    message: 'Konten tidak ditemukan',
  });
}

/** Everything a manual entry decides on, for one platform, in one query. */
function contentSelect(platform: social_platform) {
  return {
    id: true,
    contract_id: true,
    contracts: {
      select: {
        invoice: { select: { status: true } },
        creators: {
          select: {
            social_accounts: {
              where: { platform },
              select: CONNECTION_SELECT,
            },
          },
        },
      },
    },
    content_links: {
      where: { platform },
      select: {
        id: true,
        platform: true,
        url: true,
        data_state: true,
        last_synced_at: true,
        ...METRIC_SELECT,
      },
    },
  } as const;
}

/**
 * Runs a manual performance entry (EnterManualPerformance) against the database: one read of the
 * content's link and account on the platform, then the plan's guarded write and its timeline
 * event in the same transaction. A refusal, a missed guard or a failed event leaves nothing.
 */
@Injectable()
export class ManualPerformanceService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ManualPerformanceClient,
  ) {}

  enter(
    contentId: string,
    platform: social_platform,
    metrics: PerformanceMetrics,
    adminUserId: string | null,
    now = new Date(),
  ): Promise<LinkPerformance> {
    const command = new EnterManualPerformance(platform, metrics);

    return this.prisma.$transaction(async (transaction) => {
      // Links exist only on delivered content; anything else reads as missing. This first read
      // only finds whose contract to lock: nothing it returns is decided on.
      const where = { id: contentId, status: 'link_submitted' } as const;
      const owner = await transaction.contents.findFirst({
        where,
        select: { id: true, contract_id: true },
      });
      if (!owner) throw contentNotFound();

      // Finalize locks the contract before reading the numbers it freezes. Taking the same lock
      // before reading the invoice puts this entry wholly before or wholly after a Finalize:
      // after it, the invoice reads finalized and the entry is refused (AC 18, OWASP A08:2025).
      await lockContractRow(transaction, owner.contract_id);

      const content = await transaction.contents.findFirst({
        where,
        select: contentSelect(platform),
      });
      if (!content) throw contentNotFound();

      const [link] = content.content_links;
      const plan = command.plan(
        {
          contentId: content.id,
          invoiceStatus: content.contracts.invoice?.status ?? 'running',
          connection: content.contracts.creators.social_accounts[0],
          link: link ? { ...link, platform } : null,
        },
        adminUserId,
        now,
      );

      const { count } = await transaction.content_links.updateMany({
        where: plan.guard,
        data: plan.data,
      });
      if (count === 0) {
        throw new ConflictException({
          code: 'PERFORMANCE_CHANGED',
          message: 'Data link ini baru saja berubah. Muat ulang lalu coba lagi',
        });
      }
      await transaction.content_events.create({ data: plan.event });
      return plan.result;
    });
  }
}
