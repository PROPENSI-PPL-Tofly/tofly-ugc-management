import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  computePerformance,
  computeProgress,
  contentOutcome,
  currentContract,
  daysRemaining,
  isContractActive,
  type MetricsContent,
  type MetricsContract,
} from './creator-metrics.js';
import type {
  ContractStatus,
  ContractSummary,
  CreatorDetail,
  CreatorListResponse,
  CreatorSummary,
} from './dto/creator-summary.dto.js';
import {
  DEFAULT_PAGE_SIZE,
  type ListCreatorsQuery,
  MAX_PAGE_SIZE,
} from './dto/list-creators.query.js';

/**
 * Exactly the columns a summary needs. `select` rather than `include` so tokens on
 * social_accounts cannot ride along into a response.
 */
const SUMMARY_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  phoneNumber: true,
  accessRevokeDate: true,
  user: { select: { email: true } },
  socialAccounts: { select: { platform: true, username: true, isConnected: true } },
  contracts: {
    orderBy: { startDate: 'asc' },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      daysBetween: true,
      contentQuota: true,
      contents: {
        orderBy: { deadline: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          deadline: true,
          status: true,
          isProposal: true,
          videoLink: true,
          videoSubmittedAt: true,
          _count: { select: { submissions: true } },
        },
      },
    },
  },
} as const;

/** The detail view additionally lists the drafts themselves, newest last. */
const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  contracts: {
    ...SUMMARY_SELECT.contracts,
    select: {
      ...SUMMARY_SELECT.contracts.select,
      contents: {
        ...SUMMARY_SELECT.contracts.select.contents,
        select: {
          ...SUMMARY_SELECT.contracts.select.contents.select,
          submissions: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, link: true, revisionNotes: true, createdAt: true },
          },
        },
      },
    },
  },
} as const;

type ContentRow = {
  id: string;
  name: string;
  type: string;
  deadline: Date;
  status: string;
  isProposal: boolean;
  videoLink: string | null;
  videoSubmittedAt: Date | null;
  _count: { submissions: number };
  submissions?: { id: string; link: string; revisionNotes: string | null; createdAt: Date }[];
};

type ContractRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  daysBetween: number;
  contentQuota: number;
  contents: ContentRow[];
};

type CreatorRow = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  accessRevokeDate: Date | null;
  user: { email: string };
  socialAccounts: { platform: string; username: string; isConnected: boolean }[];
  contracts: ContractRow[];
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fullName(creator: CreatorRow): string {
  return [creator.firstName, creator.middleName, creator.lastName].filter(Boolean).join(' ');
}

function toMetricsContent(content: ContentRow): MetricsContent {
  return {
    deadline: content.deadline,
    videoSubmittedAt: content.videoSubmittedAt,
    isProposal: content.isProposal,
    submissionCount: content.submissions?.length ?? content._count.submissions,
  };
}

function toMetricsContract(contract: ContractRow): MetricsContract {
  return {
    id: contract.id,
    startDate: contract.startDate,
    endDate: contract.endDate,
    contents: contract.contents.map(toMetricsContent),
  };
}

function contractStatus(contract: ContractRow, today: Date): ContractStatus {
  if (isContractActive(toMetricsContract(contract), today)) return 'active';
  return contract.endDate < today ? 'expired' : 'upcoming';
}

function summariseContract(
  creator: CreatorRow,
  current: ContractRow | null,
  today: Date,
): ContractSummary {
  if (!current) {
    return {
      status: 'none',
      startDate: null,
      endDate: null,
      daysRemaining: null,
      periodNumber: 0,
      contentQuota: 0,
    };
  }

  return {
    status: contractStatus(current, today),
    startDate: isoDate(current.startDate),
    endDate: isoDate(current.endDate),
    daysRemaining: daysRemaining(toMetricsContract(current), today),
    // Contracts arrive ordered by start date, so the position is the period number.
    periodNumber: creator.contracts.findIndex((contract) => contract.id === current.id) + 1,
    contentQuota: current.contentQuota,
  };
}

function summarise(creator: CreatorRow, today: Date): CreatorSummary {
  const current = currentContract(creator.contracts.map(toMetricsContract), today);
  const currentRow = creator.contracts.find((contract) => contract.id === current?.id) ?? null;
  const contents = currentRow ? currentRow.contents.map(toMetricsContent) : [];

  return {
    id: creator.id,
    name: fullName(creator),
    email: creator.user.email,
    socials: Object.fromEntries(
      creator.socialAccounts.map((account) => [account.platform, account.username]),
    ),
    accessRevokeDate: creator.accessRevokeDate ? isoDate(creator.accessRevokeDate) : null,
    contract: summariseContract(creator, currentRow, today),
    progress: computeProgress(contents),
    performance: computePerformance(current, today),
  };
}

function matchesSearch(summary: CreatorSummary, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === '') return true;

  return (
    summary.name.toLowerCase().includes(needle) || summary.email.toLowerCase().includes(needle)
  );
}

@Injectable()
export class CreatorsService {
  private readonly logger = new Logger(CreatorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Summaries are computed in memory rather than in SQL because both filters read derived
   * values — a contract is active relative to today, a productivity band comes out of the
   * content history. Pushing that into the query would mean duplicating the rules in SQL
   * and keeping the two in step. At roster size this is a single round trip; if the roster
   * ever reaches thousands, this is the place that has to move into the database.
   */
  async list(query: ListCreatorsQuery): Promise<CreatorListResponse> {
    const today = this.clock.now();
    const rows = (await this.prisma.creator.findMany({
      select: SUMMARY_SELECT,
    })) as unknown as CreatorRow[];

    const summaries = rows
      .map((creator) => summarise(creator, today))
      .sort((left, right) => left.name.localeCompare(right.name, 'id'));

    const stats = {
      total: summaries.length,
      active: summaries.filter((summary) => summary.contract.status === 'active').length,
      good: summaries.filter((summary) => summary.performance.productivity === 'good').length,
      risk: summaries.filter((summary) => summary.performance.productivity === 'risk').length,
    };

    const contract = query.contract ?? 'all';
    const productivity = query.productivity ?? 'all';
    const matched = summaries.filter(
      (summary) =>
        matchesSearch(summary, query.q ?? '') &&
        (contract === 'all' || summary.contract.status === contract) &&
        (productivity === 'all' || summary.performance.productivity === productivity),
    );

    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;

    this.logger.log(
      `Listing creators: ${matched.length} of ${summaries.length} matched ` +
        `(contract=${contract}, productivity=${productivity}, search=${query.q ? 'yes' : 'no'})`,
    );

    return {
      items: matched.slice(start, start + pageSize),
      page,
      pageSize,
      total: matched.length,
      totalPages: Math.max(1, Math.ceil(matched.length / pageSize)),
      stats,
    };
  }

  async findOne(id: string): Promise<CreatorDetail> {
    const today = this.clock.now();
    const creator = (await this.prisma.creator.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    })) as unknown as CreatorRow | null;

    if (!creator) {
      this.logger.warn(`Creator ${id} not found`);
      throw new NotFoundException({ code: 'CREATOR_NOT_FOUND', message: 'Creator tidak ditemukan' });
    }

    const summary = summarise(creator, today);
    const current = currentContract(creator.contracts.map(toMetricsContract), today);
    const currentRow = creator.contracts.find((contract) => contract.id === current?.id) ?? null;
    const contents = currentRow?.contents ?? [];

    return {
      ...summary,
      phoneNumber: creator.phoneNumber,
      contractHistory: creator.contracts.map((contract, index) => {
        const committed = contract.contents.filter((content) => !content.isProposal);
        return {
          id: contract.id,
          periodNumber: index + 1,
          startDate: isoDate(contract.startDate),
          endDate: isoDate(contract.endDate),
          daysBetween: contract.daysBetween,
          contentQuota: contract.contentQuota,
          completed: committed.filter((content) => content.videoSubmittedAt !== null).length,
          total: committed.length,
          isCurrent: contract.id === current?.id,
        };
      }),
      contents: contents.map((content) => ({
        id: content.id,
        name: content.name,
        type: content.type,
        deadline: isoDate(content.deadline),
        status: content.status,
        outcome: contentOutcome(toMetricsContent(content), today),
        videoLink: content.videoLink,
      })),
      drafts: contents
        .filter((content) => (content.submissions?.length ?? 0) > 0)
        .map((content) => {
          const submissions = content.submissions ?? [];
          const latest = submissions[submissions.length - 1];
          return {
            contentId: content.id,
            contentName: content.name,
            // The first hand-in is the original, so anything beyond it is a revision.
            revisionCount: submissions.length - 1,
            latestLink: latest.link,
            lastSubmittedAt: isoDate(latest.createdAt),
          };
        }),
    };
  }
}
