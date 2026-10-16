import { INVOICE_FIXTURE_ROWS, invoiceFixture } from "./invoice.fixture";
import { toInvoiceList, toInvoiceListQuery, type RawInvoiceRow } from "./invoice-api";
import { DEFAULT_INVOICE_PARAMS, type InvoiceParams } from "./invoice";

const STATE: InvoiceParams = { q: "salsa", contract: "active", status: "paid", page: 3 };

const ROW: RawInvoiceRow = {
  creatorId: "creator-rangga",
  name: "Rangga Pratama",
  contractStatus: "active",
  fixedAmount: 5000000,
  extraAmount: 750000,
  bonusAmount: 300000,
  penaltyAmount: 250000,
  invoiceStatus: "accruing",
};

describe("toInvoiceListQuery", () => {
  it("sends every filter and the page, in the words the API reads", () => {
    expect(toInvoiceListQuery(STATE).toString()).toBe(
      "q=salsa&contract=active&status=paid&page=3&pageSize=10",
    );
  });

  it("leaves out a filter that is not applied, and still names the page and its size", () => {
    expect(toInvoiceListQuery(DEFAULT_INVOICE_PARAMS).toString()).toBe("page=1&pageSize=10");
  });
});

describe("toInvoiceList", () => {
  const RAW = {
    items: [ROW],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  };

  it("carries every field of the answer across, so a new one cannot arrive unnoticed", () => {
    expect(toInvoiceList(RAW).rows).toEqual([
      {
        creatorId: "creator-rangga",
        creatorName: "Rangga Pratama",
        contractStatus: "active",
        fixedAmount: 5000000,
        extraAmount: 750000,
        bonusAmount: 300000,
        penaltyAmount: 250000,
        invoiceStatus: "accruing",
      },
    ]);
  });

  it("keeps a waiting bonus waiting on the way across", () => {
    const mapped = toInvoiceList({ ...RAW, items: [{ ...ROW, bonusAmount: null }] });

    expect(mapped.rows[0].bonusAmount).toBeNull();
  });

  it("treats an empty list as one page, so the pagination has a page to name", () => {
    expect(toInvoiceList({ ...RAW, items: [], total: 0, totalPages: 0 })).toEqual({
      rows: [],
      page: 1,
      total: 0,
      totalPages: 1,
    });
  });

  it("never names a page past the last one", () => {
    expect(toInvoiceList({ ...RAW, page: 9, totalPages: 2 }).page).toBe(2);
  });
});

describe("the fixture standing in for GET /invoices", () => {
  it("answers in the shape the API will answer in, every field named", () => {
    expect(Object.keys(INVOICE_FIXTURE_ROWS[0]).sort()).toEqual([
      "bonusAmount",
      "contractStatus",
      "creatorId",
      "extraAmount",
      "fixedAmount",
      "invoiceStatus",
      "name",
      "penaltyAmount",
    ]);
  });

  it("holds enough creators for a second page, and every state the table draws", () => {
    expect(INVOICE_FIXTURE_ROWS.length).toBeGreaterThanOrEqual(12);
    expect(INVOICE_FIXTURE_ROWS.some((row) => row.bonusAmount === null)).toBe(true);
    expect(INVOICE_FIXTURE_ROWS.some((row) => row.penaltyAmount > 0)).toBe(true);
    expect(INVOICE_FIXTURE_ROWS.some((row) => row.extraAmount === 0)).toBe(true);
    expect(INVOICE_FIXTURE_ROWS.some((row) => row.bonusAmount === 0)).toBe(true);
  });

  it("takes the first page and the table's page size when a query names neither", () => {
    const answer = invoiceFixture(new URLSearchParams());

    expect(answer.page).toBe(1);
    expect(answer.pageSize).toBe(10);
  });

  it("takes the first page and the table's page size when a query names nonsense", () => {
    const answer = invoiceFixture(new URLSearchParams("page=abc&pageSize=0"));

    expect(answer.page).toBe(1);
    expect(answer.pageSize).toBe(10);
  });
});
