import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { creatorName, savedSnapshot } from '../invoices/invoice-rows.js';
import {
  EXECUTIVE_DASHBOARD_REPOSITORY,
  FINALIZED_STATUSES,
  type DashboardContentRow,
  type DashboardCreatorRow,
  type DashboardLinkRow,
  type ExecutiveDashboardRepository,
  type FinalizedInvoiceRow,
} from './executive-dashboard.repository.js';

type Client = Pick<
  PrismaService,
  'invoices' | 'content_links' | 'contents' | 'contracts'
>;

const startOf = (day: string) => new Date(`${day}T00:00:00.000Z`);
const endOf = (day: string) => new Date(`${day}T23:59:59.999Z`);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** A component amount is null while the formula had no data; the charts read that as zero. */
const amount = (component: { amount: number | null } | null | undefined): number =>
  component?.amount ?? 0;

@Injectable()
export class PrismaExecutiveDashboardRepository implements ExecutiveDashboardRepository {
  constructor(@Inject(PrismaService) private readonly prisma: Client) {}

  async finalizedInRange(from: string, to: string): Promise<FinalizedInvoiceRow[]> {
    const rows = await this.prisma.invoices.findMany({
      where: {
        finalized_at: { gte: startOf(from), lte: endOf(to) },
        status: { in: [...FINALIZED_STATUSES] },
      },
      select: {
        finalized_at: true,
        status: true,
        snapshot: true,
        contracts: { select: { creator_id: true } },
      },
    });

    return rows.flatMap((row): FinalizedInvoiceRow[] => {
      const snapshot = savedSnapshot(row.snapshot);
      if (snapshot === null || row.finalized_at === null) return [];
      return [
        {
          creatorId: row.contracts.creator_id,
          finalizedAt: isoDay(row.finalized_at),
          status: row.status,
          fixedRate: amount(snapshot.fixedRate),
          additionalContent: amount(snapshot.additionalContent),
          performanceBonus: amount(snapshot.performanceBonus),
          total: snapshot.total,
        },
      ];
    });
  }

  async linksSentInRange(from: string, to: string): Promise<DashboardLinkRow[]> {
    const rows = await this.prisma.content_links.findMany({
      where: { submitted_at: { gte: startOf(from), lte: endOf(to) } },
      select: {
        submitted_at: true,
        platform: true,
        views: true,
        data_state: true,
        contents: { select: { contracts: { select: { creator_id: true } } } },
      },
    });

    return rows.map((row) => ({
      creatorId: row.contents.contracts.creator_id,
      submittedAt: isoDay(row.submitted_at),
      platform: row.platform,
      views: row.views,
      dataState: row.data_state,
    }));
  }

  async contentsDueInRange(from: string, to: string): Promise<DashboardContentRow[]> {
    const rows = await this.prisma.contents.findMany({
      where: { deadline: { gte: startOf(from), lte: endOf(to) } },
      select: {
        deadline: true,
        video_submitted_at: true,
        status: true,
        contracts: { select: { creator_id: true } },
      },
    });

    return rows.map((row) => ({
      creatorId: row.contracts.creator_id,
      deadline: isoDay(row.deadline),
      videoSubmittedAt: row.video_submitted_at === null ? null : isoDay(row.video_submitted_at),
      isProposal: row.status === 'pending',
    }));
  }

  async creatorsWithContracts(from: string, to: string): Promise<DashboardCreatorRow[]> {
    const rows = await this.prisma.contracts.findMany({
      where: {
        start_date: { lte: startOf(to) },
        end_date: { gte: startOf(from) },
      },
      select: {
        start_date: true,
        end_date: true,
        content_quota: true,
        creators: {
          select: { id: true, first_name: true, middle_name: true, last_name: true },
        },
      },
    });

    return rows.map((row) => ({
      creatorId: row.creators.id,
      name: creatorName(row.creators),
      quota: row.content_quota,
      startDate: isoDay(row.start_date),
      endDate: isoDay(row.end_date),
    }));
  }
}
