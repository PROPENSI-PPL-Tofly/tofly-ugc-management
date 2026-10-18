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
  type InvoiceParams,
  type InvoiceRow,
  type InvoiceStatus,
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
}

export interface RawInvoiceList {
  items: RawInvoiceRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
  query.set("page", String(state.page));
  query.set("pageSize", String(INVOICE_PAGE_SIZE));
  return query;
}

function toInvoiceRow(raw: RawInvoiceRow): InvoiceRow {
  const { fixedRate, additionalContent, performanceBonus, penalty } = raw.components;

  return {
    creatorId: raw.creatorId,
    creatorName: raw.creatorName,
    contractStatus: raw.contract.status,
    // A fee or penalty waiting for a formula has charged nothing yet.
    fixedAmount: fixedRate.amount ?? 0,
    extraAmount: additionalContent.amount ?? 0,
    // The bonus alone stays null while it waits: the table says "Menunggu data", not a zero.
    bonusAmount: performanceBonus.amount,
    penaltyAmount: penalty.amount ?? 0,
    totalAmount: raw.total,
    invoiceStatus: raw.invoiceStatus,
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
