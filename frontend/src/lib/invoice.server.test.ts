import { DEFAULT_INVOICE_PARAMS, type InvoiceParams } from "./invoice";
import { fetchRateInvoices } from "./invoice.server";

function params(over: Partial<InvoiceParams> = {}): InvoiceParams {
  return { ...DEFAULT_INVOICE_PARAMS, ...over };
}

describe("fetchRateInvoices", () => {
  it("answers the first page of the whole table, ten creators at a time", async () => {
    const list = await fetchRateInvoices(params());

    expect(list.rows).toHaveLength(10);
    expect(list.page).toBe(1);
    expect(list.total).toBe(12);
    expect(list.totalPages).toBe(2);
  });

  it("answers the rest on the second page", async () => {
    const list = await fetchRateInvoices(params({ page: 2 }));

    expect(list.rows).toHaveLength(2);
    expect(list.page).toBe(2);
  });

  it("narrows by the search word, wherever in the name it sits", async () => {
    const list = await fetchRateInvoices(params({ q: "salsa" }));

    expect(list.rows.map((row) => row.creatorName)).toEqual(["Salsa Amelia"]);
    expect(list.total).toBe(1);
  });

  it("narrows by contract and by invoice status together", async () => {
    const list = await fetchRateInvoices(params({ contract: "active", status: "accruing" }));

    expect(list.total).toBe(3);
    expect(list.rows).toHaveLength(3);
    expect(
      list.rows.every(
        (row) => row.contractStatus === "active" && row.invoiceStatus === "accruing",
      ),
    ).toBe(true);
  });

  it("shows the last page when asked for one past the end, never an empty table", async () => {
    const list = await fetchRateInvoices(params({ page: 9 }));

    expect(list.page).toBe(2);
    expect(list.rows).toHaveLength(2);
  });

  it("keeps a list nothing matches as it is asked: nothing shown, one page to name", async () => {
    const list = await fetchRateInvoices(params({ q: "zzz", page: 5 }));

    expect(list.rows).toEqual([]);
    expect(list.total).toBe(0);
    expect(list.page).toBe(1);
    expect(list.totalPages).toBe(1);
  });

  it("hands the rows to the table in the table's own names", async () => {
    const list = await fetchRateInvoices(params({ q: "rangga" }));

    expect(list.rows[0]).toEqual({
      creatorId: "creator-rangga",
      creatorName: "Rangga Pratama",
      contractStatus: "active",
      fixedAmount: 5000000,
      extraAmount: 750000,
      bonusAmount: 300000,
      penaltyAmount: 0,
      invoiceStatus: "accruing",
    });
  });
});
