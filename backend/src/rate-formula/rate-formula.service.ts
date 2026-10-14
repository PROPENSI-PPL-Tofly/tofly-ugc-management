import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, social_platform } from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PerformanceBonusTier, RateFormula } from './rate-formula.js';

/** The formula as GET and PUT /rate-formula answer it. Who saved it is never part of it. */
export type RateFormulaView =
  | ({ configured: true; updatedAt: string } & RateFormula)
  | {
      configured: false;
      specificBonus: null;
      latePenaltyPerDay: null;
      performanceBonusTiers: RateFormula['performanceBonusTiers'];
      updatedAt: null;
    };

/** The columns of the rate_formula row the service reads. */
export interface RateFormulaRow {
  specific_bonus: Prisma.Decimal;
  late_penalty_per_day: Prisma.Decimal;
  updated_at: Date;
}

/** The columns of a performance_bonus_tiers row the service reads. */
export interface PerformanceBonusTierRow {
  platform: social_platform;
  position: number;
  threshold: Prisma.Decimal;
  bonus: Prisma.Decimal;
}

/** The two tables, as Prisma's client and its transaction client both reach them. */
export interface RateFormulaTables {
  rate_formula: {
    findUnique(args: Prisma.rate_formulaFindUniqueArgs): Promise<RateFormulaRow | null>;
    upsert(args: Prisma.rate_formulaUpsertArgs): Promise<RateFormulaRow>;
  };
  performance_bonus_tiers: {
    findMany(
      args: Prisma.performance_bonus_tiersFindManyArgs,
    ): Promise<PerformanceBonusTierRow[]>;
    deleteMany(args: Prisma.performance_bonus_tiersDeleteManyArgs): Promise<unknown>;
    createMany(args: Prisma.performance_bonus_tiersCreateManyArgs): Promise<unknown>;
  };
}

/**
 * Where the service reads and saves the formula. The service depends on this, not on
 * PrismaService, so a test can hand it a stub.
 */
export interface RateFormulaClient extends RateFormulaTables {
  $transaction(work: (tx: RateFormulaTables) => Promise<unknown>): Promise<unknown>;
}

function emptyTiers(): RateFormula['performanceBonusTiers'] {
  return Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [platform, []]),
  ) as unknown as RateFormula['performanceBonusTiers'];
}

const UNCONFIGURED = {
  configured: false,
  specificBonus: null,
  latePenaltyPerDay: null,
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
   * Replaces the formula and every tier in one transaction, so a failure part way leaves the
   * earlier formula whole, and answers the formula as saved.
   */
  async replace(
    formula: RateFormula,
    adminUserId: string | undefined,
  ): Promise<RateFormulaView> {
    const amounts = {
      specific_bonus: formula.specificBonus,
      late_penalty_per_day: formula.latePenaltyPerDay,
      updated_by: adminUserId ?? null,
    };
    const tiers = SOCIAL_PLATFORMS.flatMap((platform) =>
      formula.performanceBonusTiers[platform].map(({ threshold, bonus }, index) => ({
        platform,
        position: index + 1,
        threshold,
        bonus,
      })),
    );

    return (await this.client.$transaction(async (tx) => {
      await tx.rate_formula.upsert({
        where: { id: true },
        create: { id: true, ...amounts },
        update: { ...amounts, updated_at: new Date() },
      });
      await tx.performance_bonus_tiers.deleteMany({});
      if (tiers.length > 0) {
        await tx.performance_bonus_tiers.createMany({ data: tiers });
      }
      return this.readFrom(tx);
    })) as RateFormulaView;
  }

  private async readFrom(tables: RateFormulaTables): Promise<RateFormulaView> {
    const row = await tables.rate_formula.findUnique({ where: { id: true } });
    if (!row) {
      return { ...UNCONFIGURED, performanceBonusTiers: emptyTiers() };
    }

    const tierRows = await tables.performance_bonus_tiers.findMany({
      orderBy: [{ platform: 'asc' }, { position: 'asc' }],
    });
    const performanceBonusTiers = emptyTiers();
    for (const tier of tierRows) {
      performanceBonusTiers[tier.platform].push(toTier(tier));
    }

    return {
      configured: true,
      specificBonus: row.specific_bonus.toNumber(),
      latePenaltyPerDay: row.late_penalty_per_day.toNumber(),
      performanceBonusTiers,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

function toTier(row: PerformanceBonusTierRow): PerformanceBonusTier {
  return { threshold: row.threshold.toNumber(), bonus: row.bonus.toNumber() };
}
