import { Inject, Injectable } from '@nestjs/common';
import type {
  performance_metric,
  Prisma,
  social_platform,
} from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PerformanceBonusTier, RateFormula } from './rate-formula.js';

/**
 * Each platform's metric and tiers as GET and PUT /rate-formula answer them. A platform nobody
 * has picked a metric for answers null, never a default metric.
 */
export type StoredPerformanceBonus = Record<
  social_platform,
  { metric: performance_metric | null; tiers: PerformanceBonusTier[] }
>;

/** The formula as GET and PUT /rate-formula answer it. Who saved it is never part of it. */
export type RateFormulaView =
  | ({ configured: true; updatedAt: string } & Omit<
      RateFormula,
      'performanceBonus' | 'maxPenaltyDays'
    > & {
        /** Null for a formula saved before the cap existed. */
        maxPenaltyDays: number | null;
        performanceBonus: StoredPerformanceBonus;
      })
  | {
      configured: false;
      specificBonus: null;
      latePenaltyPerDay: null;
      maxPenaltyDays: null;
      performanceBonus: StoredPerformanceBonus;
      updatedAt: null;
    };

/**
 * The columns of the rate_formula row the service reads. The amounts are unconstrained numeric,
 * so the database can refuse a fraction instead of rounding it; Prisma reads them as Decimal.
 */
export interface RateFormulaRow {
  specific_bonus: Prisma.Decimal;
  late_penalty_per_day: Prisma.Decimal;
  max_penalty_days: number | null;
  updated_at: Date;
}

/** A performance_bonus_metrics row. */
export interface PerformanceBonusMetricRow {
  platform: social_platform;
  metric: performance_metric;
}

/** The columns of a performance_bonus_tiers row the service reads. */
export interface PerformanceBonusTierRow {
  platform: social_platform;
  position: number;
  threshold: Prisma.Decimal;
  bonus: Prisma.Decimal;
}

/** The three tables, as Prisma's client and its transaction client both reach them. */
export interface RateFormulaTables {
  rate_formula: {
    findUnique(
      args: Prisma.rate_formulaFindUniqueArgs,
    ): Promise<RateFormulaRow | null>;
    upsert(args: Prisma.rate_formulaUpsertArgs): Promise<RateFormulaRow>;
  };
  performance_bonus_metrics: {
    findMany(
      args: Prisma.performance_bonus_metricsFindManyArgs,
    ): Promise<PerformanceBonusMetricRow[]>;
    deleteMany(
      args: Prisma.performance_bonus_metricsDeleteManyArgs,
    ): Promise<unknown>;
    createMany(
      args: Prisma.performance_bonus_metricsCreateManyArgs,
    ): Promise<unknown>;
  };
  performance_bonus_tiers: {
    findMany(
      args: Prisma.performance_bonus_tiersFindManyArgs,
    ): Promise<PerformanceBonusTierRow[]>;
    deleteMany(
      args: Prisma.performance_bonus_tiersDeleteManyArgs,
    ): Promise<unknown>;
    createMany(
      args: Prisma.performance_bonus_tiersCreateManyArgs,
    ): Promise<unknown>;
  };
}

/**
 * Where the service reads and saves the formula. The service depends on this, not on
 * PrismaService, so a test can hand it a stub.
 */
export interface RateFormulaClient extends RateFormulaTables {
  $transaction(
    work: (tx: RateFormulaTables) => Promise<unknown>,
  ): Promise<unknown>;
}

function unconfiguredBonus(): StoredPerformanceBonus {
  return Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [platform, { metric: null, tiers: [] }]),
  ) as unknown as StoredPerformanceBonus;
}

const UNCONFIGURED = {
  configured: false,
  specificBonus: null,
  latePenaltyPerDay: null,
  maxPenaltyDays: null,
  updatedAt: null,
} as const;

/**
 * The Atur Formula Rate settings (PBI-8): one formula for every creator. The invoice calculation
 * (Subtask 8.2) reads it through `read`.
 */
@Injectable()
export class RateFormulaService {
  constructor(
    @Inject(PrismaService) private readonly client: RateFormulaClient,
  ) {}

  /** The saved formula, or an unconfigured one: never zeros standing in for amounts nobody set. */
  read(): Promise<RateFormulaView> {
    return this.readFrom(this.client);
  }

  /**
   * Replaces the formula, every metric and every tier in one transaction, so a failure part way
   * leaves the earlier formula whole, and answers the formula as saved.
   */
  async replace(
    formula: RateFormula,
    adminUserId: string | undefined,
  ): Promise<RateFormulaView> {
    const amounts = {
      specific_bonus: formula.specificBonus,
      late_penalty_per_day: formula.latePenaltyPerDay,
      max_penalty_days: formula.maxPenaltyDays,
      updated_by: adminUserId ?? null,
    };
    const metrics = SOCIAL_PLATFORMS.map((platform) => ({
      platform,
      metric: formula.performanceBonus[platform].metric,
    }));
    const tiers = SOCIAL_PLATFORMS.flatMap((platform) =>
      formula.performanceBonus[platform].tiers.map(
        ({ threshold, bonus }, index) => ({
          platform,
          position: index + 1,
          threshold,
          bonus,
        }),
      ),
    );

    return (await this.client.$transaction(async (tx) => {
      await tx.rate_formula.upsert({
        where: { id: true },
        create: { id: true, ...amounts },
        update: { ...amounts, updated_at: new Date() },
      });
      // A tier belongs to its platform's metric row: tiers out first, metrics in first.
      await tx.performance_bonus_tiers.deleteMany({});
      await tx.performance_bonus_metrics.deleteMany({});
      await tx.performance_bonus_metrics.createMany({ data: metrics });
      await tx.performance_bonus_tiers.createMany({ data: tiers });
      return this.readFrom(tx);
    })) as RateFormulaView;
  }

  private async readFrom(tables: RateFormulaTables): Promise<RateFormulaView> {
    const row = await tables.rate_formula.findUnique({ where: { id: true } });
    if (!row) {
      return { ...UNCONFIGURED, performanceBonus: unconfiguredBonus() };
    }

    const metricRows = await tables.performance_bonus_metrics.findMany({});
    const tierRows = await tables.performance_bonus_tiers.findMany({
      orderBy: [{ platform: 'asc' }, { position: 'asc' }],
    });
    const performanceBonus = unconfiguredBonus();
    for (const { platform, metric } of metricRows) {
      performanceBonus[platform].metric = metric;
    }
    for (const { platform, threshold, bonus } of tierRows) {
      performanceBonus[platform].tiers.push({
        threshold: Number(threshold),
        bonus: Number(bonus),
      });
    }

    return {
      configured: true,
      specificBonus: Number(row.specific_bonus),
      latePenaltyPerDay: Number(row.late_penalty_per_day),
      maxPenaltyDays: row.max_penalty_days,
      performanceBonus,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
