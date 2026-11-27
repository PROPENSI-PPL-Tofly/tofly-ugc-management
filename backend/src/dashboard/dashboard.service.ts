// One endpoint's worth of work: read the two ranges, reduce the rows to the six KPI inputs,
// stack the three charts and rank the creators. Every rule lives in a pure module next to this
// file; this service only loads and assembles.

import { Inject, Injectable } from '@nestjs/common';
import { contentOutcome } from '../creators/creator-metrics.js';
import {
  checkDashboardRange,
  dashboardRange,
  monthsBetween,
  type DashboardRangeMonths,
} from './dashboard-range.js';
import { buildCharts } from './dashboard-series.js';
import { creatorRows } from './dashboard-creator-rows.js';
import { computeKpis, type KpiInputs } from './dashboard-kpis.js';
import type { ExecutiveDashboard } from './dto/executive-dashboard.dto.js';
import {
  EXECUTIVE_DASHBOARD_REPOSITORY,
  type DashboardContentRow,
  type DashboardCreatorRow,
  type DashboardLinkRow,
  type ExecutiveDashboardRepository,
  type FinalizedInvoiceRow,
} from './executive-dashboard.repository.js';

const MEASURED = ['synced', 'manual'];

interface RangeRows {
  invoices: FinalizedInvoiceRow[];
  links: DashboardLinkRow[];
  contents: DashboardContentRow[];
  creators: DashboardCreatorRow[];
}

function atMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function outcomeOf(
  content: { deadline: string; videoSubmittedAt: string | null },
  today: Date,
) {
  return contentOutcome(
    {
      deadline: atMidnight(content.deadline),
      videoSubmittedAt:
        content.videoSubmittedAt === null ? null : atMidnight(content.videoSubmittedAt),
      isProposal: false,
      type: 'evergreen',
      submissionCount: 0,
    },
    today,
  );
}

function inputs(rows: RangeRows, today: Date): KpiInputs {
  const measured = rows.links.filter(
    (link) => link.platform !== null && link.views !== null && MEASURED.includes(link.dataState),
  );
  const views = measured.reduce((sum, link) => sum + link.views!, 0);
  const engagement = measured.reduce(
    (sum, link) => sum + (link.likes ?? 0) + (link.comments ?? 0) + (link.shares ?? 0),
    0,
  );
  // Content that has fallen due: sent, or with its deadline behind us. What is still open this
  // month is not due yet, the same rule as Creator Database (computePerformance).
  const outcomes = rows.contents
    .filter((content) => !content.isProposal)
    .map((content) => outcomeOf(content, today));
  const due = outcomes.filter((outcome) => outcome !== 'open');
  const onTime = due.filter((outcome) => outcome === 'on_time').length;

  return {
    spending: rows.invoices.reduce((sum, invoice) => sum + invoice.total, 0),
    unpaid: rows.invoices.reduce(
      (sum, invoice) => sum + (invoice.status === 'paid' ? 0 : invoice.total),
      0,
    ),
    views,
    engagement,
    due: due.length,
    onTime,
  };
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(EXECUTIVE_DASHBOARD_REPOSITORY)
    private readonly repository: ExecutiveDashboardRepository,
  ) {}

  async executive(today: Date, months: DashboardRangeMonths): Promise<ExecutiveDashboard> {
    const range = dashboardRange(checkDashboardRange(months), today);
    const read = (from: string, to: string): Promise<RangeRows> =>
      Promise.all([
        this.repository.finalizedInRange(from, to),
        this.repository.linksSentInRange(from, to),
        this.repository.contentsDueInRange(from, to),
        this.repository.creatorsWithContracts(from, to),
      ]).then(([invoices, links, contents, creators]) => ({
        invoices,
        links,
        contents,
        creators,
      }));

    const [current, previous] = await Promise.all([
      read(range.from, range.to),
      read(range.previousFrom, range.previousTo),
    ]);

    return {
      range,
      kpis: computeKpis(inputs(current, today), inputs(previous, today)),
      charts: buildCharts(
        current.invoices,
        current.links,
        current.contents,
        today,
        monthsBetween(range.from, range.to),
      ),
      creators: creatorRows(
        current.creators.map((creator) => ({
          creatorId: creator.creatorId,
          name: creator.name,
          contract: {
            quota: creator.quota,
            startDate: creator.startDate,
            endDate: creator.endDate,
          },
        })),
        current.invoices.map((invoice) => ({
          creatorId: invoice.creatorId,
          spending: invoice.total,
        })),
        current.links,
        current.contents,
        'views',
        'desc',
        today,
      ),
      missingViewLinks: current.links.filter(
        (link) => link.platform !== null && !MEASURED.includes(link.dataState),
      ).length,
    };
  }
}
