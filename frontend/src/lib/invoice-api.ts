// The translation between Rate & Invoicing and the endpoints that answer it (subtask 8.3):
// GET /invoices for the table and GET /invoices/:creatorId for the breakdown popups. The page's
// state goes out as the query the API reads, and the API's answers come back as the rows the
// table renders and the breakdown the popups read. Everything that knows the API's shape lives
// here (Adapter), so either side can change without the other moving.

import type {
  BonusMetric,
  BonusPlatform,
  BonusTierRule,
  InvoiceBreakdown,
} from "./invoice-breakdown";
import {
  INVOICE_PAGE_SIZE,
  type ContractStatus,
  type InvoiceList,
  type InvoiceSummary,
  type InvoiceParams,
  type InvoiceRow,
  type InvoiceStatus,
  type PendingBonus,
} from "./invoice";

/** One content item's share of a component, with what its amount was worked out from. */
export interface RawInvoiceLine {
  contentId: string;
  contentName: string;
  amount: number;
  basis: Record<string, number | string>;
}

/** One part of an invoice; the amount is null while it waits for data or for a formula. */
export interface RawInvoiceComponent {
  amount: number | null;
  status: "calculated" | "waiting_for_data";
  lines: RawInvoiceLine[];
}

/** One manual adjustment, as POST answers it and GET lists it. */
export interface RawAdjustment {
  id: string;
  amount: number;
  reason: string;
  actorId: string;
  /** ISO instant. */
  createdAt: string;
}

/** One creator's running invoice, as GET /invoices answers it. */
export interface RawInvoiceRow {
  creatorId: string;
  creatorName: string;
  contract: {
    id: string;
    status: ContractStatus;
    /** YYYY-MM-DD */
    startDate: string;
    /** YYYY-MM-DD */
    endDate: string;
    /** The last day the contract counts: endDate, or the day access was revoked if earlier. */
    lastDay: string;
  };
  components: {
    fixedRate: RawInvoiceComponent;
    additionalContent: RawInvoiceComponent;
    performanceBonus: RawInvoiceComponent;
    penalty: RawInvoiceComponent;
  };
  /** What the components add up to, which may be below zero. */
  rawTotal: number;
  /** The amount owed, never below zero. */
  total: number;
  floored: boolean;
  invoiceStatus: InvoiceStatus;
  /** The manual adjustments recorded against this invoice, oldest first. */
  adjustments: RawAdjustment[];
  /** The frozen breakdown of a finalized invoice; null while it still runs. */
  snapshot: { finalizedAt: string } | null;
}

export interface RawInvoiceList {
  items: RawInvoiceRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: InvoiceSummary;
}

/** The rate formula as the backend stores it (8.1). */
export interface RawRateFormula {
  latePenaltyPerDay: number;
  maxPenaltyDays: number;
  specificBonus: number;
  performanceBonus: Partial<
    Record<BonusPlatform, { metric: BonusMetric; tiers: { threshold: number; bonus: number }[] }>
  >;
}

/** One creator's invoice as GET /invoices/:creatorId answers it, for the breakdown popups. */
export interface RawInvoiceDetail extends RawInvoiceRow {
  /** 1 for the first contract, counting up with every renewal. */
  periodNumber: number;
  /** Null while no admin has saved a formula. */
  formula: RawRateFormula | null;
}

/** The page's state as the query GET /invoices reads: the filters that are applied, the page and its size. */
export function toInvoiceListQuery(state: InvoiceParams): URLSearchParams {
  const query = new URLSearchParams();
  if (state.q) query.set("q", state.q);
  if (state.contract !== "all") query.set("contract", state.contract);
  if (state.status !== "all") query.set("status", state.status);
  if (state.sort !== "action" || state.order !== "asc") {
    query.set("sort", state.sort);
    query.set("order", state.order);
  }
  query.set("page", String(state.page));
  query.set("pageSize", String(INVOICE_PAGE_SIZE));
  return query;
}

function isWaiting(component: RawInvoiceComponent): boolean {
  return component.status === "waiting_for_data";
}

/**
 * What freezing a bonus still waiting for data would hold: the lines measured so far, added to a
 * total that counted the bonus as nothing yet, then held at zero, as the backend settles it.
 */
function pendingBonus(bonus: RawInvoiceComponent, rawTotal: number): PendingBonus {
  const amount = bonus.lines.reduce((sum, line) => sum + line.amount, 0);
  const frozen = rawTotal + amount;
  return { amount, totalAmount: Math.max(0, frozen), floored: frozen < 0 };
}

function toInvoiceRow(raw: RawInvoiceRow): InvoiceRow {
  const { fixedRate, additionalContent, performanceBonus, penalty } = raw.components;

  return {
    creatorId: raw.creatorId,
    creatorName: raw.creatorName,
    contractId: raw.contract.id,
    contractStatus: raw.contract.status,
    // An early end counts: freezing waits for the day the contract stopped, not its end date.
    contractEnd: raw.contract.lastDay,
    // A fee or penalty waiting for a formula has charged nothing yet.
    fixedAmount: fixedRate.amount ?? 0,
    extraAmount: additionalContent.amount ?? 0,
    // The bonus alone stays null while it waits: the table says "Menunggu data", not a zero.
    bonusAmount: performanceBonus.amount,
    penaltyAmount: penalty.amount ?? 0,
    totalAmount: raw.total,
    floored: raw.floored,
    // A fee or penalty without a formula cannot be frozen; the server refuses and so does the form.
    dataWaiting: [fixedRate, additionalContent, penalty].some(isWaiting),
    pendingBonus: isWaiting(performanceBonus) ? pendingBonus(performanceBonus, raw.rawTotal) : null,
    invoiceStatus: raw.invoiceStatus,
    // An answer that predates the field simply lists none.
    adjustments: (raw.adjustments ?? []).map((adjustment) => ({
      id: adjustment.id,
      amount: adjustment.amount,
      reason: adjustment.reason,
      createdAt: adjustment.createdAt,
    })),
    frozenAt: raw.snapshot?.finalizedAt ?? null,
  };
}

/**
 * The API's answer under the page's names. An empty list is still one page: the pagination
 * stays on show and needs a page to name.
 */
export function toInvoiceList(raw: RawInvoiceList): InvoiceList {
  const totalPages = Math.max(1, raw.totalPages);

  return {
    rows: raw.items.map(toInvoiceRow),
    page: Math.min(raw.page, totalPages),
    total: raw.total,
    totalPages,
    summary: raw.summary,
  };
}

/** A number the backend put in a line's basis, or zero for one that is missing or not a number. */
function basisNumber(line: RawInvoiceLine | undefined, key: string): number {
  const value = line?.basis[key];
  return typeof value === "number" ? value : 0;
}

function basisText(line: RawInvoiceLine, key: string): string {
  return String(line.basis[key]);
}

function tierRules(formula: RawRateFormula | null): BonusTierRule[] {
  if (!formula) return [];

  return (Object.keys(formula.performanceBonus) as BonusPlatform[]).map((platform) => {
    const rule = formula.performanceBonus[platform]!;
    return {
      platform,
      metric: rule.metric,
      steps: rule.tiers.map(({ threshold, bonus }) => ({ min: threshold, bonus })),
    };
  });
}

/**
 * One creator's invoice as the breakdown popups read it. The amounts are the backend's: this
 * only renames, so a popup's total always matches the table cell that opened it.
 */
export function toInvoiceBreakdown(raw: RawInvoiceDetail): InvoiceBreakdown {
  const { fixedRate, additionalContent, performanceBonus, penalty } = raw.components;
  // The fixed rate pays the contract period, so its one line names the contract, not a content.
  const [period] = fixedRate.lines;
  const cap = raw.formula?.maxPenaltyDays ?? 0;

  return {
    creatorName: raw.creatorName,
    fixed: {
      period: {
        number: raw.periodNumber,
        start: raw.contract.startDate,
        end: raw.contract.endDate,
        quotaDone: basisNumber(period, "delivered"),
        quotaTotal: basisNumber(period, "quota"),
      },
      total: fixedRate.amount ?? 0,
      notStarted: raw.contract.status === "upcoming",
    },
    extra: {
      lines: additionalContent.lines.map((line) => ({
        contentId: line.contentId,
        name: line.contentName,
        rate: basisNumber(line, "fee"),
        amount: line.amount,
        // A Specific item handed in late earns nothing; the backend still lists it, at Rp0.
        late: line.basis.late === "yes",
      })),
      total: additionalContent.amount ?? 0,
    },
    bonus: {
      lines: performanceBonus.lines.map((line) => ({
        kind: "performance" as const,
        contentId: line.contentId,
        name: line.contentName,
        platform: basisText(line, "platform") as BonusPlatform,
        metric: basisText(line, "metric") as BonusMetric,
        value: basisNumber(line, "value"),
        tier: basisNumber(line, "tier"),
        amount: line.amount,
      })),
      total: performanceBonus.amount ?? 0,
      performance: performanceBonus.status === "waiting_for_data" ? "waiting" : "ready",
      rules: { tiers: tierRules(raw.formula), specificBonus: raw.formula?.specificBonus ?? 0 },
    },
    penalty: {
      lines: penalty.lines.map((line) => {
        const daysLate = basisNumber(line, "daysLate");
        return {
          contentId: line.contentId,
          name: line.contentName,
          daysLate,
          chargedDays: basisNumber(line, "chargedDays"),
          ratePerDay: basisNumber(line, "perDay"),
          amount: line.amount,
          // The days still count while the content is out, the cap is not reached and the
          // contract is running; past its end the backend stops counting.
          ongoing:
            line.basis.handedIn === "no" && daysLate < cap && raw.contract.status === "active",
        };
      }),
      total: penalty.amount ?? 0,
    },
  };
}
