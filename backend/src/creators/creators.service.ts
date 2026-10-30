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
import {
  toContentEntries,
  toContractPeriods,
  toDraftEntries,
} from './creator-detail.js';
import type {
  ContractSummary,
  ContractType,
  CreatorDetail,
  CreatorListResponse,
  CreatorSummary,
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
      fixed_rate: true,
      contract_type: true,
      // Deliberately no `take`: each period's progress, performance and remaining Evergreen
      // slots are computed from all of its contents, so a cut list would report wrong numbers.
      // Only the few columns those need are read; the table pages the contents themselves
      // through GET /contents?contract=. The list stays small because onboarding caps a
      // contract's quota at MAX_CONTENT_QUOTA (100), plus any proposals. If periods outgrow
      // that, move the metrics into SQL aggregates.
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
          // Only the first link: its url is the video the detail shows (PBI-38 AC 7).
          content_links: {
            orderBy: [{ submitted_at: 'asc' }, { created_at: 'asc' }],
            take: 1,
            select: { url: true },
          },
          video_submitted_at: true,
          approval_bypassed: true,
          _count: { select: { submissions: true } },
          // Only the newest hand-in: its time flags a late draft, its link is the latest draft.
          submissions: {
            orderBy: {
              created_at: 'desc',
            },
            take: 1,
            select: {
              link: true,
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

/** Either selection carries what the summary reads. */
type SummaryRow = CreatorRow | DetailRow;

type SummaryContent = SummaryRow['contracts'][number]['contents'][number];

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
      submissionCount: content._count.submissions,
    })),
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
  constructor(@Inject(PrismaService) private readonly prisma: CreatorsClient) {}

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

  async findOne(id: string, today = new Date()): Promise<CreatorDetail> {
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
    const currentRow =
      row.contracts[periods.findIndex((period) => period.isCurrent)];

    return {
      ...summary,
      phoneNumber: row.phone_number,
      contractHistory: periods,
      contents: currentRow ? toContentEntries(currentRow, today) : [],
      drafts: currentRow ? toDraftEntries(currentRow) : [],
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

  private matches(item: CreatorSummary, filters: Filters): boolean {
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

  private toSummary(row: SummaryRow, today: Date): CreatorSummary {
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

      progress: computeProgress(current ? current.contents : []),

      performance: computePerformance(current, today),
    };
  }
}
