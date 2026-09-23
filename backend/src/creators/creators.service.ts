import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  computePerformance,
  computeProgress,
  contentOutcome,
  contractStatus,
  currentContract,
  daysRemaining,
  periodNumber,
  type MetricsContract,
} from './creator-metrics.js';
import type { CreateCreatorDto } from './dto/create-creator.dto.js';
import type {
  ContractSummary,
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
  firstName: true,
  middleName: true,
  lastName: true,
  accessRevokeDate: true,
  user: { select: { email: true } },
  socialAccounts: { select: { platform: true, username: true } },
  contracts: {
    select: {
      id: true,
      startDate: true,
      endDate: true,
      contentQuota: true,
      contents: {
        select: {
          deadline: true,
          videoSubmittedAt: true,
          isProposal: true,
          _count: { select: { submissions: true } },
        },
      },
    },
  },
} satisfies Prisma.CreatorSelect;

export type CreatorRow = Prisma.CreatorGetPayload<{
  select: typeof CREATOR_SELECT;
}>;

// Detail uses a wider selection so the detail modal can display the full creator record.
const DETAIL_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  phoneNumber: true,
  accessRevokeDate: true,
  user: {
    select: {
      email: true,
    },
  },
  socialAccounts: {
    select: {
      platform: true,
      username: true,
    },
  },
  contracts: {
    orderBy: {
      startDate: 'asc',
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      daysBetween: true,
      contentQuota: true,
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
          isProposal: true,
          videoLink: true,
          videoSubmittedAt: true,
          _count: {
            select: {
              submissions: true,
            },
          },
          submissions: {
            orderBy: {
              createdAt: 'asc',
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

const NO_CONTRACT: ContractSummary = {
  status: 'none',
  startDate: null,
  endDate: null,
  daysRemaining: null,
  periodNumber: 0,
  contentQuota: 0,
};

/** Postgres `date` columns arrive as midnight UTC; the first ten ISO characters are the day. */
function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type ContractWithQuota = MetricsContract & { contentQuota: number };

function toMetricsContract(
  contract: CreatorRow['contracts'][number],
): ContractWithQuota {
  return {
    id: contract.id,
    contentQuota: contract.contentQuota,
    startDate: contract.startDate,
    endDate: contract.endDate,
    contents: contract.contents.map((content) => ({
      deadline: content.deadline,
      videoSubmittedAt: content.videoSubmittedAt,
      isProposal: content.isProposal,
      submissionCount: content._count.submissions,
    })),
  };
}

/** The slice of the database client this service touches; tests hand in a stub of just that. */
export type CreatorsClient = Pick<PrismaService, 'creator'>;

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

const ORDER_BY: Prisma.CreatorOrderByWithRelationInput[] = [
  { firstName: 'asc' },
  { lastName: 'asc' },
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

  create(dto: CreateCreatorDto): Promise<{ id: string }>;
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
        this.prisma.creator.findMany({
          select: CREATOR_SELECT,
          orderBy: ORDER_BY,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.creator.count(),
      ]);

      return this.paged(
        rows.map((row) => this.toSummary(row, today)),
        page,
        pageSize,
        total,
      );
    }

    // Derived contract/performance filters need the full set before pagination.
    const rows = await this.prisma.creator.findMany({
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
    const row = await this.prisma.creator.findUnique({
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

    const summary = this.toSummary(
      row as unknown as CreatorRow,
      today,
    );

    const contracts = row.contracts.map(
      (contract): MetricsContract => ({
        id: contract.id,
        startDate: contract.start_date,
        endDate: contract.end_date,
        contents: contract.contents.map((content) => ({
          deadline: content.deadline,
          videoSubmittedAt: content.video_submitted_at,
          isProposal: content.is_proposal,
          submissionCount: content._count.submissions,
        })),
      }),
    );

    const current = currentContract(contracts, today);

    const currentRow =
      row.contracts.find(
        (contract) => contract.id === current?.id,
      ) ?? null;

    return {
      ...summary,

      phoneNumber: row.phone_number,

      contractHistory: row.contracts.map((contract, index) => {
        const committed = contract.contents.filter(
          (content) => !content.is_proposal,
        );

        return {
          id: contract.id,
          periodNumber: index + 1,
          startDate: calendarDay(contract.start_date),
          endDate: calendarDay(contract.end_date),
          daysBetween: contract.days_between,
          contentQuota: contract.content_quota,
          completed: committed.filter(
            (content) => content.video_submitted_at !== null,
          ).length,
          total: committed.length,
          isCurrent: contract.id === current?.id,
        };
      }),

      contents: currentRow
        ? currentRow.contents.map((content) => ({
          id: content.id,
          name: content.name,
          type: content.type,
          deadline: calendarDay(content.deadline),
          status: content.status,
          outcome: contentOutcome(
            {
              deadline: content.deadline,
              videoSubmittedAt: content.video_submitted_at,
              isProposal: content.is_proposal,
              submissionCount: content._count.submissions,
            },
            today,
          ),
          videoLink: content.video_link,
        }))
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
    row: CreatorRow,
    today: Date,
  ): CreatorSummary {
    const contracts = row.contracts.map(toMetricsContract);
    const current = currentContract(contracts, today);

    const socials: CreatorSummary['socials'] = {};

    for (const account of row.socialAccounts) {
      socials[account.platform] = account.username;
    }

    return {
      id: row.id,

      name: [row.firstName, row.middleName, row.lastName]
        .filter(Boolean)
        .join(' '),

      email: row.user.email,

      socials,

      accessRevokeDate: row.accessRevokeDate
        ? calendarDay(row.accessRevokeDate)
        : null,

      contract: current
        ? {
          status: contractStatus(current, today),
          startDate: calendarDay(current.startDate),
          endDate: calendarDay(current.endDate),
          daysRemaining: daysRemaining(current, today),
          periodNumber: periodNumber(contracts, current),
          contentQuota: current.contentQuota,
        }
        : NO_CONTRACT,

      progress: computeProgress(
        current ? current.contents : [],
      ),

      performance: computePerformance(current, today),
    };
  }

  async create(dto: CreateCreatorDto): Promise<{ id: string }> {
    const user = await this.prisma.users.create({
      data: { email: dto.email },
    });

    const creator = await this.prisma.creator.create({
      data: {
        userId: user.id,
        firstName: dto.firstName,
      },
    });

    const contract = await this.prisma.contracts.create({
      data: {
        creatorId: creator.id,
        startDate: new Date(dto.contractStart),
        endDate: new Date(dto.contractEnd),
        daysBetween: dto.daysBetween,
        contentQuota: dto.contentQuota,
        fixedRate: dto.fixedRate,
      },
    });

    if (dto.manualSlotDate) {
      await this.prisma.contents.create({
        data: {
          contractId: contract.id,
          name: `${dto.firstName} - Manual Slot`,
          type: 'specific',
          brief: '',
          deadline: new Date(dto.manualSlotDate),
          status: 'scheduled',
        },
      });
    }

    return { id: creator.id };
  }
}