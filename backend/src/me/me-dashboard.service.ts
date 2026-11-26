// The creator's two new dashboard cards (PBI-24, AC 11-12): progress against the current
// contract's quota and the running invoice's estimate. Both read the same sources the creator's
// other pages do, so a card can never disagree with Task Saya or Pembayaran.

import { Injectable } from '@nestjs/common';
import {
  currentContract,
  computeProgress,
  type MetricsContract,
} from '../creators/creator-metrics.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import type { CreatorDashboardCard } from './dto/me-dashboard.dto.js';

interface ContractRow {
  id: string;
  start_date: Date;
  end_date: Date;
  content_quota: number;
  contents: {
    deadline: Date;
    video_submitted_at: Date | null;
    type: 'evergreen' | 'specific';
    status: string;
    _count: { submissions: number };
  }[];
}

type Client = {
  creators: {
    findUnique: (args: {
      where: { id: string };
      select: { contracts: unknown };
    }) => Promise<{ contracts: ContractRow[] } | null>;
  };
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function toMetrics(contract: ContractRow): MetricsContract {
  return {
    id: contract.id,
    startDate: contract.start_date,
    endDate: contract.end_date,
    contents: contract.contents.map((content) => ({
      deadline: content.deadline,
      videoSubmittedAt: content.video_submitted_at,
      isProposal: content.status === 'pending',
      type: content.type,
      submissionCount: content._count.submissions,
    })),
  };
}

@Injectable()
export class MeDashboardService {
  constructor(
    private readonly prisma: Client,
    private readonly invoices: InvoicesService,
  ) {}

  async dashboard(creatorId: string, today = new Date()): Promise<CreatorDashboardCard> {
    const [row, views] = await Promise.all([
      this.prisma.creators.findUnique({
        where: { id: creatorId },
        select: { contracts: true },
      }),
      this.invoices.forCreator(creatorId, today),
    ]);

    const current = currentContract((row?.contracts ?? []).map(toMetrics), today);
    const progress = computeProgress(current?.contents ?? [], current?.quota ?? 0);
    const accruing = views.find((view) => view.invoiceStatus === 'accruing');

    return {
      period: current
        ? { startDate: isoDay(current.startDate), endDate: isoDay(current.endDate) }
        : null,
      sent: progress.submitted,
      quota: progress.total,
      earningsEstimate: accruing?.total ?? 0,
      paymentsHref: '/creator/payments',
    };
  }
}
