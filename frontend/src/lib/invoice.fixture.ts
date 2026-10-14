// A stand-in for GET /invoices until subtask 8.3's endpoint answers the table (TODO(SCRUM-8.3)):
// the same response shape, narrowed and paged the way the endpoint will. Deleted whole when the
// real endpoint lands — invoice.server.ts then calls the backend with the same query.

import { INVOICE_PAGE_SIZE } from "./invoice";
import type { RawInvoiceList, RawInvoiceRow } from "./invoice-api";

export const INVOICE_FIXTURE_ROWS: readonly RawInvoiceRow[] = [
  {
    creatorId: "creator-rangga",
    name: "Rangga Pratama",
    contractStatus: "active",
    fixedAmount: 5000000,
    extraAmount: 750000,
    bonusAmount: 300000,
    penaltyAmount: 0,
    invoiceStatus: "accruing",
  },
  {
    creatorId: "creator-dimas",
    name: "Dimas Aji",
    contractStatus: "active",
    fixedAmount: 4500000,
    extraAmount: 0,
    bonusAmount: null,
    penaltyAmount: 0,
    invoiceStatus: "accruing",
  },
  {
    creatorId: "creator-nabila",
    name: "Nabila Putri",
    contractStatus: "upcoming",
    fixedAmount: 3000000,
    extraAmount: 500000,
    bonusAmount: 200000,
    penaltyAmount: 150000,
    invoiceStatus: "finalized",
  },
  {
    creatorId: "creator-salsa",
    name: "Salsa Amelia",
    contractStatus: "expired",
    fixedAmount: 5000000,
    extraAmount: 1000000,
    bonusAmount: 0,
    penaltyAmount: 250000,
    invoiceStatus: "paid",
  },
  {
    creatorId: "creator-budi",
    name: "Budi Santoso",
    contractStatus: "active",
    fixedAmount: 2500000,
    extraAmount: 0,
    bonusAmount: null,
    penaltyAmount: 0,
    invoiceStatus: "creator_acked",
  },
  {
    creatorId: "creator-citra",
    name: "Citra Lestari",
    contractStatus: "active",
    fixedAmount: 3500000,
    extraAmount: 250000,
    bonusAmount: 100000,
    penaltyAmount: 0,
    invoiceStatus: "payment_uploaded",
  },
  {
    creatorId: "creator-eka",
    name: "Eka Wijaya",
    contractStatus: "expired",
    fixedAmount: 4000000,
    extraAmount: 0,
    bonusAmount: 150000,
    penaltyAmount: 0,
    invoiceStatus: "paid",
  },
  {
    creatorId: "creator-fajar",
    name: "Fajar Nugraha",
    contractStatus: "upcoming",
    fixedAmount: 2000000,
    extraAmount: 0,
    bonusAmount: null,
    penaltyAmount: 0,
    invoiceStatus: "accruing",
  },
  {
    creatorId: "creator-gita",
    name: "Gita Permata",
    contractStatus: "active",
    fixedAmount: 6000000,
    extraAmount: 1500000,
    bonusAmount: 450000,
    penaltyAmount: 0,
    invoiceStatus: "finalized",
  },
  {
    creatorId: "creator-hana",
    name: "Hana Safira",
    contractStatus: "active",
    fixedAmount: 3000000,
    extraAmount: 0,
    bonusAmount: 0,
    penaltyAmount: 0,
    invoiceStatus: "accruing",
  },
  {
    creatorId: "creator-indra",
    name: "Indra Kusuma",
    contractStatus: "expired",
    fixedAmount: 3500000,
    extraAmount: 0,
    bonusAmount: null,
    penaltyAmount: 100000,
    invoiceStatus: "finalized",
  },
  {
    creatorId: "creator-jaya",
    name: "Jaya Perkasa",
    contractStatus: "upcoming",
    fixedAmount: 2750000,
    extraAmount: 0,
    bonusAmount: 0,
    penaltyAmount: 0,
    invoiceStatus: "payment_uploaded",
  },
];

/** The endpoint's side of the seam: the query in, one page of the list out. */
export function invoiceFixture(query: URLSearchParams): RawInvoiceList {
  const q = (query.get("q") ?? "").trim().toLowerCase();
  const contract = query.get("contract");
  const status = query.get("status");
  const page = Math.max(1, Number(query.get("page") ?? "1") || 1);
  const pageSize = Math.max(1, Number(query.get("pageSize") ?? "") || INVOICE_PAGE_SIZE);

  const matched = INVOICE_FIXTURE_ROWS.filter(
    (row) =>
      (q === "" || row.name.toLowerCase().includes(q)) &&
      (contract === null || row.contractStatus === contract) &&
      (status === null || row.invoiceStatus === status),
  );
  const total = matched.length;
  const totalPages = Math.ceil(total / pageSize);

  return {
    items: matched.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}
