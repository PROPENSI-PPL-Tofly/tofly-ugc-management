// The formula admins saved in "Atur Formula Rate" (8.1), read through RateFormulaService and
// mapped onto the calculator's RateFormula.

import { Inject, Injectable } from '@nestjs/common';
import {
  RateFormulaService,
  type RateFormulaView,
} from '../rate-formula/rate-formula.service.js';
import type { SocialPlatform } from './invoice-component.js';
import {
  DEFAULT_MAX_PENALTY_DAYS,
  type PlatformBonus,
  type RateFormula,
  type RateFormulaSource,
} from './rate-formula.js';

const PLATFORMS: readonly SocialPlatform[] = ['instagram', 'tiktok'];

/**
 * What GET /rate-formula answers. maxPenaltyDays arrives with #100 (null for a formula saved
 * before it); until then the view does not carry it at all, and both read as the default cap.
 */
export type StoredFormula = RateFormulaView & {
  maxPenaltyDays?: number | null;
};

/** The saved formula as the calculator reads it, or null while nobody has saved one. */
export function toRateFormula(view: StoredFormula): RateFormula | null {
  if (!view.configured) return null;

  const performanceBonus: Partial<Record<SocialPlatform, PlatformBonus>> = {};
  for (const platform of PLATFORMS) {
    const { metric, tiers } = view.performanceBonus[platform];
    // A platform nobody picked a metric for has no tiers to pay.
    if (metric !== null) performanceBonus[platform] = { metric, tiers };
  }

  return {
    latePenaltyPerDay: view.latePenaltyPerDay,
    maxPenaltyDays: view.maxPenaltyDays ?? DEFAULT_MAX_PENALTY_DAYS,
    specificBonus: view.specificBonus,
    performanceBonus,
  };
}

@Injectable()
export class StoredRateFormulaSource implements RateFormulaSource {
  constructor(
    @Inject(RateFormulaService) private readonly formulas: RateFormulaService,
  ) {}

  async current(): Promise<RateFormula | null> {
    return toRateFormula(await this.formulas.read());
  }
}
