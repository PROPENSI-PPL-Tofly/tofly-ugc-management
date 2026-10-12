import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { content_status, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  computePerformance,
  computeProgress,
  contractStatus,
  currentContract,
  daysRemaining,
  periodNumber,
  type MetricsContract,
} from './creator-metrics.js';
import { toContractPeriods } from './creator-detail.js';
import type {
  ContentEntry,
  ContractSummary,
  ContractType,
  CreatorDetail,
  CreatorListResponse,
  CreatorSummary,
  PeriodContent,
} from './dto/creator-summary.dto.js';
import type { Filters } from './filters.js';
import type { Paging } from './paging.js';

// Only what the summary needs. Selecting columns (rather than whole rows) keeps
// phone numbers and workflow-only fields out of the list response by construction.
const CREATOR_SELECT = {
  id: true,
  first_name: true,
  middle_name: true,
  last_name: true,
  access_revoke_date: true,
  users: { select: { email: true } },
  social_accounts: { select: { platform: true, username: true } },
  contracts: {
    select: {
      id: true,
      start_date: true,
      end_date: true,
      content_quota: true,
      contract_type: true,
      contents: {
        select: {
          deadline: true,
          video_submitted_at: true,
          status: true,
          _count: { select: { submissions: true } },
        },
      },
    },
  },
} satisfies Prisma.creatorsSelect;

export type CreatorRow = Prisma.creatorsGetPayload<{
  select: typeof CREATOR_SELECT;
}>;

// Detail uses a wider selection so the detail modal can display the full creator record.
const DETAIL_SELECT = {
  id: true,
  first_name: true,
  middle_name: true,
  last_name: true,
  phone_number: true,
  access_revoke_date: true,
  users: {
    select: {
      email: true,
    },
  },
  social_accounts: {
    select: {
      platform: true,
      username: true,
    },
  },
  contracts: {
    orderBy: {
      start_date: 'asc',
    },
    select: {
      id: true,
      start_date: true,
      end_date: true,
      days_between: true,
      content_quota: true,
      contract_type: true,
      contents: {
        orderBy: {
          deadline: 'asc',
        },
        select: {
          id: true,
          name: true,
          type: true,
          deadline: true,
          status: true,
          video_link: true,
          video_submitted_at: true,
          approval_bypassed: true,
          // Every hand-in is loaded anyway, so their count is read from this list.
          submissions: {
            orderBy: {
              created_at: 'asc',
            },
            select: {
              id: true,
              link: true,
              revision_notes: true,
              created_at: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.creatorsSelect;

type DetailRow = Prisma.creatorsGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

/** Either selection carries what the summary reads; only how hand-ins are counted differs. */
type SummaryRow = CreatorRow | DetailRow;

type SummaryContent = SummaryRow['contracts'][number]['contents'][number];

function submissionCount(content: SummaryContent): number {
  return '_count' in content
    ? content._count.submissions
    : content.submissions.length;
}

const NO_CONTRACT: ContractSummary = {
  status: 'none',
  startDate: null,
  endDate: null,
  daysRemaining: null,
  periodNumber: 0,
  contentQuota: 0,
  type: null,
};

/** Creator-proposed content an admin has not accepted yet: not a commitment, so not counted. */
function isProposal(status: content_status): boolean {
  return status === 'pending';
}

/** Postgres `date` columns arrive as midnight UTC; the first ten ISO characters are the day. */
function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type ContractWithQuota = MetricsContract & {
  contentQuota: number;
  contractType: ContractType;
};

function toMetricsContract(
  contract: SummaryRow['contracts'][number],
): ContractWithQuota {
  const contents: SummaryContent[] = contract.contents;

  return {
    id: contract.id,
    contentQuota: contract.content_quota,
    contractType: contract.contract_type,
    startDate: contract.start_date,
    endDate: contract.end_date,
    contents: contents.map((content) => ({
      deadline: content.deadline,
      videoSubmittedAt: content.video_submitted_at,
      isProposal: isProposal(content.status),
      submissionCount: submissionCount(content),
    })),
  };
}

/** The flat entry the old detail modal reads, cut from the period's richer content. */
function toContentEntry(content: PeriodContent): ContentEntry {
  return {
    id: content.id,
    name: content.name,
    type: content.type,
    deadline: content.deadline,
    status: content.status,
    outcome: content.outcome,
    tags: content.tags,
    videoLink: content.videoLink,
  };
}

/** The slice of the database client this service touches; tests hand in a stub of just that. */
export type CreatorsClient = Pick<PrismaService, 'creators'>;

// contractStatus and productivity are derived from dates and nested content/submission
// counts, not stored columns — there is no WHERE clause for them. Search could be pushed to
// SQL on its own, but keeping all three filters on the same code path (rather than a SQL
// path for some and JS for others) is what keeps "which creators does the admin see" a single
// rule to read, instead of two that have to agree.
function hasFilters(filters: Filters): boolean {
  return (
    filters.q !== undefined ||
    filters.contractStatus !== undefined ||
    filters.productivity !== undefined
  );
}

const ORDER_BY: Prisma.creatorsOrderByWithRelationInput[] = [
  { first_name: 'asc' },
  { last_name: 'asc' },
  { id: 'asc' },
];

/** What the controller needs from the service, so it can be swapped or stubbed by contract. */
export interface CreatorLister {
  list(
    paging: Paging,
    today?: Date,
    filters?: Filters,
  ): Promise<CreatorListResponse>;

  findOne(id: string, today?: Date): Promise<CreatorDetail>;
}

@Injectable()
export class CreatorsService implements CreatorLister {
  constructor(
    @Inject(PrismaService) private readonly prisma: CreatorsClient,
  ) {}

  async list(
    { page, pageSize }: Paging,
    today = new Date(),
    filters: Filters = {},
  ): Promise<CreatorListResponse> {
    if (!hasFilters(filters)) {
      const [rows, total] = await Promise.all([
        this.prisma.creators.findMany({
          select: CREATOR_SELECT,
          orderBy: ORDER_BY,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.creators.count(),
      ]);

      return this.paged(
        rows.map((row) => this.toSummary(row, today)),
        page,
        pageSize,
        total,
      );
    }

    // Derived contract/performance filters need the full set before pagination.
    const rows = await this.prisma.creators.findMany({
      select: CREATOR_SELECT,
      orderBy: ORDER_BY,
    });

    const matched = rows
      .map((row) => this.toSummary(row, today))
      .filter((item) => this.matches(item, filters));

    const start = (page - 1) * pageSize;

    return this.paged(
      matched.slice(start, start + pageSize),
      page,
      pageSize,
      matched.length,
    );
  }

  async findOne(
    id: string,
    today = new Date(),
  ): Promise<CreatorDetail> {
    const row = await this.prisma.creators.findUnique({
      where: {
        id,
      },
      select: DETAIL_SELECT,
    });

    if (!row) {
      throw new NotFoundException({
        code: 'CREATOR_NOT_FOUND',
        message: 'Creator tidak ditemukan',
      });
    }

    const summary = this.toSummary(row, today);

    const periods = toContractPeriods(row.contracts, today);
    // Both lists keep the database order, so a period's index is its row's index.
    const currentIndex = periods.findIndex((period) => period.isCurrent);
    const currentRow = row.contracts[currentIndex] ?? null;

    return {
      ...summary,

      phoneNumber: row.phone_number,

      contractHistory: periods,

      contents: currentRow
        ? periods[currentIndex].contents.map(toContentEntry)
        : [],

      drafts: currentRow
        ? currentRow.contents
          .filter((content) => content.submissions.length > 0)
          .map((content) => {
            const latest =
              content.submissions[
              content.submissions.length - 1
                ];

            return {
              contentId: content.id,
              contentName: content.name,
              revisionCount:
                content.submissions.length - 1,
              latestLink: latest.link,
              lastSubmittedAt: calendarDay(latest.created_at),
            };
          })
        : [],
    };
  }

  /** Wraps an already-correctly-sliced page of items with the response envelope. */
  private paged(
    items: CreatorSummary[],
    page: number,
    pageSize: number,
    total: number,
  ): CreatorListResponse {
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private matches(
    item: CreatorSummary,
    filters: Filters,
  ): boolean {
    if (filters.q) {
      const q = filters.q.toLowerCase();

      if (
        !item.name.toLowerCase().includes(q) &&
        !item.email.toLowerCase().includes(q)
      ) {
        return false;
      }
    }

    if (
      filters.contractStatus &&
      item.contract.status !== filters.contractStatus
    ) {
      return false;
    }

    if (
      filters.productivity &&
      item.performance.productivity !== filters.productivity
    ) {
      return false;
    }

    return true;
  }

  private toSummary(
    row: SummaryRow,
    today: Date,
  ): CreatorSummary {
    const contracts = row.contracts.map(toMetricsContract);
    const current = currentContract(contracts, today);

    const socials: CreatorSummary['socials'] = {};

    for (const account of row.social_accounts) {
      socials[account.platform] = account.username;
    }

    return {
      id: row.id,

      name: [row.first_name, row.middle_name, row.last_name]
        .filter(Boolean)
        .join(' '),

      email: row.users.email,

      socials,

      accessRevokeDate: row.access_revoke_date
        ? calendarDay(row.access_revoke_date)
        : null,

      contract: current
        ? {
          status: contractStatus(current, today),
          startDate: calendarDay(current.startDate),
          endDate: calendarDay(current.endDate),
          daysRemaining: daysRemaining(current, today),
          periodNumber: periodNumber(contracts, current),
          contentQuota: current.contentQuota,
          type: current.contractType,
        }
        : NO_CONTRACT,

      progress: computeProgress(
        current ? current.contents : [],
      ),

      performance: computePerformance(current, today),
    };
  }
}