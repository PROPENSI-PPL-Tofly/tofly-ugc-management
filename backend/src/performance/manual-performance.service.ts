import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  invoice_status,
  link_data_state,
  Prisma,
  social_platform,
} from '@prisma/client';
import { adminActor } from '../contents/content-event-actors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  canEnterManually,
  effectiveState,
  type LinkMetrics,
  type LinkPerformance,
} from './link-performance.js';
import {
  CONNECTION_SELECT,
  isConnected,
  type AccountConnection,
} from './performance-links.js';

/** Everything the manual input rule decides on, read in one query. No token is among it. */
export const MANUAL_LINK_SELECT = {
  id: true,
  platform: true,
  url: true,
  views: true,
  likes: true,
  comments: true,
  shares: true,
  data_state: true,
  contents: {
    select: {
      contracts: {
        select: {
          invoice: { select: { status: true } },
          creators: {
            select: {
              social_accounts: CONNECTION_SELECT,
            },
          },
        },
      },
    },
  },
} as const;

export interface ManualLinkRow extends LinkMetrics {
  id: string;
  platform: social_platform | null;
  url: string;
  data_state: link_data_state;
  contents: {
    contracts: {
      invoice: { status: invoice_status } | null;
      creators: {
        social_accounts: AccountConnection[];
      };
    };
  };
}

export interface ManualPerformanceTransaction {
  content_links: {
    findFirst(args: {
      where: { content_id: string; platform: social_platform };
      select: typeof MANUAL_LINK_SELECT;
    }): Promise<ManualLinkRow | null>;
    updateMany(args: {
      where: { id: string; data_state: link_data_state };
      data: LinkMetrics & {
        data_state: 'manual';
        manual_by: string | null;
        manual_at: Date;
      };
    }): Promise<{ count: number }>;
  };
  content_events: {
    create(args: {
      data: Prisma.content_eventsUncheckedCreateInput;
    }): Promise<unknown>;
  };
}

/** The slice of Prisma this service touches, so tests stub exactly that. */
export interface ManualPerformanceClient {
  $transaction<T>(
    work: (transaction: ManualPerformanceTransaction) => Promise<T>,
  ): Promise<T>;
}

function metricsOf(row: LinkMetrics): LinkMetrics {
  return {
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
  };
}

/**
 * An admin types a link's numbers in when the platform cannot give them (PBI-27, AC 14-18): one
 * read, then the numbers and their timeline entry in the same transaction, so a refused or lost
 * write leaves neither behind.
 */
@Injectable()
export class ManualPerformanceService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ManualPerformanceClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  save(
    contentId: string,
    platform: social_platform,
    metrics: LinkMetrics,
    adminUserId: string | null,
  ): Promise<LinkPerformance> {
    const now = this.now();
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.content_links.findFirst({
        where: { content_id: contentId, platform },
        select: MANUAL_LINK_SELECT,
      });
      if (!row) {
        throw new NotFoundException({
          code: 'LINK_NOT_FOUND',
          message: 'Link tidak ditemukan',
        });
      }

      // A finalized invoice is frozen (PBI-12); its bonus is corrected by an adjustment (AC 18).
      const invoice = row.contents.contracts.invoice;
      if (invoice && invoice.status !== 'running') {
        throw new ConflictException({
          code: 'INVOICE_FINALIZED',
          message: 'Invoice sudah difinalisasi. Koreksi lewat penyesuaian.',
        });
      }

      const before = effectiveState(
        row.data_state,
        isConnected(
          row.contents.contracts.creators.social_accounts,
          row.platform,
        ),
      );
      if (!canEnterManually(before)) {
        throw new ConflictException({
          code: 'MANUAL_NOT_ALLOWED',
          message:
            'Angka hanya bisa diisi manual saat akun belum terhubung, link tidak ditemukan, atau gagal sinkron',
        });
      }

      // Only onto the state this decision was made on: a sync landing meanwhile wins.
      const { count } = await transaction.content_links.updateMany({
        where: { id: row.id, data_state: row.data_state },
        data: {
          ...metrics,
          data_state: 'manual',
          manual_by: adminUserId,
          manual_at: now,
        },
      });
      if (count === 0) {
        throw new ConflictException({
          code: 'LINK_CHANGED',
          message: 'Data link ini baru saja berubah. Muat ulang lalu coba lagi',
        });
      }

      await transaction.content_events.create({
        data: {
          content_id: contentId,
          event_type: 'Performance Entered',
          ...adminActor(adminUserId),
          occurred_at: now,
          event_data: {
            platform,
            before: { ...metricsOf(row), state: before },
            after: { ...metrics, state: 'manual' },
          },
        },
      });

      return {
        platform: row.platform,
        url: row.url,
        ...metrics,
        state: 'manual',
        lastSyncedAt: null,
        manualAt: now.toISOString(),
      };
    });
  }
}
