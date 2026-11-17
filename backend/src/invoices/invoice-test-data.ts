// Builders shared by the invoice specs: one contract and its content, with every field a test
// does not care about set to something unremarkable.

import type {
  InvoiceContent,
  InvoiceContext,
  InvoiceContract,
  InvoiceLink,
} from './invoice-component.js';
import type { RateFormula } from './rate-formula.js';

/** 18 Sep 2026, midnight UTC: 07:00 the same day in Jakarta. */
export const TODAY = new Date('2026-09-18T00:00:00Z');

/** The evening before TODAY, when the last sync brought a link's numbers. */
export const SYNCED_AT = new Date('2026-09-17T13:00:00Z');

/** A calendar day relative to TODAY, the way Postgres `date` columns arrive (midnight UTC). */
export function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 18 + offset));
}

export const FORMULA: RateFormula = {
  latePenaltyPerDay: 15_000,
  maxPenaltyDays: 3,
  specificBonus: 100_000,
  performanceBonus: {
    instagram: {
      metric: 'views',
      tiers: [
        { threshold: 40_000, bonus: 400_000 },
        { threshold: 10_000, bonus: 150_000 },
      ],
    },
    tiktok: { metric: 'likes', tiers: [{ threshold: 1_000, bonus: 50_000 }] },
  },
};

export function contract(
  overrides: Partial<InvoiceContract> = {},
): InvoiceContract {
  return {
    id: 'contract-1',
    startDate: day(-60),
    endDate: day(60),
    fixedRate: 5_500_000,
    contentQuota: 11,
    endedEarlyOn: null,
    ...overrides,
  };
}

export function content(
  overrides: Partial<InvoiceContent> = {},
): InvoiceContent {
  return {
    id: 'content-1',
    name: 'Evg_1_RanggaPratama',
    type: 'evergreen',
    status: 'scheduled',
    deadline: day(10),
    videoSubmittedAt: null,
    links: [],
    ...overrides,
  };
}

/** One of a content's video links, on Instagram, with no numbers yet. */
export function link(overrides: Partial<InvoiceLink> = {}): InvoiceLink {
  return {
    platform: 'instagram',
    views: null,
    likes: null,
    comments: null,
    shares: null,
    state: 'waiting',
    source: null,
    lastSyncedAt: null,
    manualAt: null,
    ...overrides,
  };
}

export function context(
  overrides: Partial<InvoiceContext> = {},
): InvoiceContext {
  return {
    contract: contract(),
    contents: [],
    formula: FORMULA,
    today: TODAY,
    ...overrides,
  };
}
