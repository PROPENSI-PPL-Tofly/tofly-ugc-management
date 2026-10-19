// Answers of GET /invoices and GET /invoices/:creatorId as the backend sends them, taken from a
// local run against the seed data, for the tests of the modules that read them. Test data only:
// nothing the app renders imports this.

import type { RawInvoiceDetail, RawInvoiceRow } from "./invoice-api";

export const RANGGA_ID = "0fcc2741-73b1-4df2-8d64-6c7363862499";

/** Rangga: an active contract, two Specific items on time, one late Evergreen, bonus waiting. */
export const RAW_RANGGA: RawInvoiceRow = {
  creatorId: RANGGA_ID,
  creatorName: "Rangga Pratama",
  contract: {
    id: "6917ccf7-36a2-44d4-9222-ca3558f54a54",
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-11-30",
    lastDay: "2026-11-30",
    period: 1,
  },
  components: {
    fixedRate: {
      amount: 500000,
      status: "calculated",
      lines: [
        {
          contentId: "6917ccf7-36a2-44d4-9222-ca3558f54a54",
          contentName: "Kontrak",
          amount: 500000,
          basis: { delivered: 4, quota: 9 },
        },
      ],
    },
    additionalContent: {
      amount: 200000,
      status: "calculated",
      lines: [
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000001",
          contentName: "Review layanan same-day",
          amount: 100000,
          basis: { fee: 100000 },
        },
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000002",
          contentName: "Promo akhir bulan",
          amount: 100000,
          basis: { fee: 100000 },
        },
      ],
    },
    performanceBonus: {
      amount: null,
      status: "waiting_for_data",
      lines: [
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000003",
          contentName: "Unboxing Kelas TOEFL",
          amount: 150000,
          basis: { platform: "instagram", metric: "views", value: 12400, tier: 1 },
        },
      ],
    },
    penalty: {
      amount: 150000,
      status: "calculated",
      lines: [
        {
          contentId: "a1a1a1a1-0000-4000-8000-000000000004",
          contentName: "Cara lacak paket",
          amount: 150000,
          basis: { daysLate: 5, chargedDays: 3, perDay: 50000, handedIn: "yes" },
        },
      ],
    },
  },
  rawTotal: 550000,
  total: 550000,
  floored: false,
  invoiceStatus: "accruing",
  adjustments: [],
  snapshot: null,
};

export const RAW_RANGGA_DETAIL: RawInvoiceDetail = {
  ...RAW_RANGGA,
  periodNumber: 2,
  formula: {
    latePenaltyPerDay: 50000,
    maxPenaltyDays: 3,
    specificBonus: 100000,
    performanceBonus: {
      instagram: {
        metric: "views",
        tiers: [
          { threshold: 50000, bonus: 150000 },
          { threshold: 10000, bonus: 50000 },
        ],
      },
      tiktok: { metric: "likes", tiers: [{ threshold: 1000, bonus: 50000 }] },
    },
  },
};

/** A contract that has not started and a formula nobody has saved: nothing billed or measured yet. */
export const RAW_UPCOMING_NO_FORMULA: RawInvoiceDetail = {
  creatorId: "f4f4f4f4-0000-4000-8000-000000000009",
  creatorName: "Farah Nur Aini",
  contract: {
    id: "f4f4f4f4-0000-4000-8000-00000000000a",
    status: "upcoming",
    startDate: "2026-11-01",
    endDate: "2027-01-31",
    lastDay: "2027-01-31",
    period: 1,
  },
  components: {
    fixedRate: {
      amount: 0,
      status: "calculated",
      lines: [
        {
          contentId: "f4f4f4f4-0000-4000-8000-00000000000a",
          contentName: "Kontrak",
          amount: 0,
          basis: { delivered: 0, quota: 3 },
        },
      ],
    },
    additionalContent: { amount: null, status: "waiting_for_data", lines: [] },
    performanceBonus: { amount: null, status: "waiting_for_data", lines: [] },
    penalty: { amount: null, status: "waiting_for_data", lines: [] },
  },
  rawTotal: 0,
  total: 0,
  floored: false,
  invoiceStatus: "accruing",
  adjustments: [],
  snapshot: null,
  periodNumber: 1,
  formula: null,
};
