import {
  amountLabel,
  bonusLabel,
  buildInvoiceQuery,
  CONTRACT_STATUS_LABELS,
  DEFAULT_INVOICE_PARAMS,
  DASH,
  finalLabel,
  INVOICE_STATUS_LABELS,
  invoiceExportHref,
  invoiceHref,
  MAX_INVOICE_SEARCH_LENGTH,
  nextInvoiceSort,
  parseInvoiceParams,
  penaltyLabel,
  type InvoiceRow,
} from "./invoice";

const ROW: InvoiceRow = {
  creatorId: "creator-rangga",
  creatorName: "Rangga Pratama",
  contractStatus: "active",
  fixedAmount: 5000000,
  extraAmount: 750000,
  bonusAmount: 300000,
  penaltyAmount: 250000,
  totalAmount: 5800000,
  floored: false,
  invoiceStatus: "accruing",
};

describe("parseInvoiceParams", () => {
  it("defaults to the whole list on page one", () => {
    expect(parseInvoiceParams({})).toEqual(DEFAULT_INVOICE_PARAMS);
    expect(DEFAULT_INVOICE_PARAMS).toEqual({
      q: "",
      contract: "all",
      status: "all",
      sort: "action",
      order: "asc",
      page: 1,
    });
  });

  it("reads the search word trimmed", () => {
    expect(parseInvoiceParams({ q: "  salsa  " }).q).toBe("salsa");
    expect(parseInvoiceParams({ q: "   " }).q).toBe("");
  });

  it("cuts a search word to the hundred characters the API reads, rather than sending one it refuses", () => {
    expect(MAX_INVOICE_SEARCH_LENGTH).toBe(100);
    expect(parseInvoiceParams({ q: "a".repeat(101) }).q).toBe("a".repeat(100));
    expect(parseInvoiceParams({ q: `  ${"b".repeat(100)}  ` }).q).toBe("b".repeat(100));
  });

  it("reads a contract and an invoice status the filter bar offers", () => {
    expect(parseInvoiceParams({ contract: "upcoming", status: "paid" })).toEqual({
      ...DEFAULT_INVOICE_PARAMS,
      contract: "upcoming",
      status: "paid",
    });
  });

  it.each(["running", "ended", "banana", ""])(
    "falls back to all contracts for %s, which is not one of ours",
    (raw) => {
      expect(parseInvoiceParams({ contract: raw }).contract).toBe("all");
    },
  );

  it.each(["waiting", "PAID", "banana", ""])(
    "falls back to all invoice statuses for %s, which is not one of ours",
    (raw) => {
      expect(parseInvoiceParams({ status: raw }).status).toBe("all");
    },
  );

  it("reads a positive whole page number", () => {
    expect(parseInvoiceParams({ page: "3" }).page).toBe(3);
  });

  it.each(["abc", "0", "-1", "1.5", ""])(
    "falls back to the first page for %s, which is not a page",
    (raw) => {
      expect(parseInvoiceParams({ page: raw }).page).toBe(1);
    },
  );

  it("takes the first value when a parameter is repeated", () => {
    expect(parseInvoiceParams({ q: ["salsa", "rangga"], page: ["2", "9"] })).toEqual({
      ...DEFAULT_INVOICE_PARAMS,
      q: "salsa",
      page: 2,
    });
  });
});

describe("buildInvoiceQuery", () => {
  it("leaves every default out, so the bare list stays at the bare address", () => {
    expect(buildInvoiceQuery(DEFAULT_INVOICE_PARAMS)).toEqual({});
  });

  it("carries every part of a narrowed state into the page links", () => {
    expect(
      buildInvoiceQuery({
        q: "salsa",
        contract: "active",
        status: "paid",
        sort: "total",
        order: "desc",
        page: 3,
      }),
    ).toEqual({ q: "salsa", contract: "active", status: "paid", sort: "total", order: "desc", page: "3" });
  });

  it("does not carry a contract or status that is not applied", () => {
    expect(buildInvoiceQuery({ ...DEFAULT_INVOICE_PARAMS, page: 2 })).toEqual({ page: "2" });
  });
});

describe("invoiceHref", () => {
  it("is the bare list address for the default state", () => {
    expect(invoiceHref(DEFAULT_INVOICE_PARAMS)).toBe("/admin/invoicing");
  });

  it("names the filters and the page on the address", () => {
    expect(invoiceHref({ q: "pw", contract: "all", status: "accruing", page: 2 })).toBe(
      "/admin/invoicing?q=pw&status=accruing&page=2",
    );
  });
});

describe("amountLabel", () => {
  it("writes an amount as rupiah", () => {
    expect(amountLabel(500000)).toBe("Rp500.000");
  });

  it("writes a dash where there is nothing to pay", () => {
    expect(amountLabel(0)).toBe(DASH);
  });
});

describe("bonusLabel", () => {
  it("says the performance bonus is still waiting, never a zero", () => {
    expect(bonusLabel(null)).toBe("Menunggu data");
  });

  it("writes the bonus once the performance data has arrived", () => {
    expect(bonusLabel(300000)).toBe("Rp300.000");
  });

  it("still dashes a bonus that turned out to be zero", () => {
    expect(bonusLabel(0)).toBe(DASH);
  });
});

describe("penaltyLabel", () => {
  it("reads a penalty as what is taken off", () => {
    expect(penaltyLabel(250000)).toBe("− Rp250.000");
  });

  it("dashes a period without penalties", () => {
    expect(penaltyLabel(0)).toBe(DASH);
  });
});

describe("finalLabel", () => {
  it("is the total the backend worked out, never one added up again here", () => {
    expect(finalLabel({ ...ROW, totalAmount: 1234000 })).toBe("Rp1.234.000");
  });

  it("shows the running total while the bonus waits for data, since the bonus cell already says so", () => {
    expect(finalLabel({ ...ROW, bonusAmount: null, totalAmount: 5500000 })).toBe("Rp5.500.000");
  });

  it("dashes a final amount that comes out to nothing", () => {
    expect(finalLabel({ ...ROW, totalAmount: 0 })).toBe(DASH);
  });

  it("writes Rp0, not a dash, when the penalty used the pay up: there was pay, and it is gone", () => {
    expect(finalLabel({ ...ROW, totalAmount: 0, floored: true })).toBe("Rp0");
  });
});

describe("the label maps", () => {
  it("names every contract status the way the prototype words it", () => {
    expect(CONTRACT_STATUS_LABELS).toEqual({
      active: "Aktif",
      upcoming: "Belum Dimulai",
      expired: "Berakhir",
    });
  });

  it("names every invoice pipeline step the way the prototype words it", () => {
    expect(INVOICE_STATUS_LABELS).toEqual({
      accruing: "Berjalan",
      finalized: "Invoice Terkirim",
      creator_acked: "Perlu Bukti Bayar",
      payment_uploaded: "Bukti Bayar Terkirim",
      paid: "Paid",
    });
  });
});

describe("the order of the table", () => {
  it.each(["action", "name", "fixed", "penalty", "total"])("reads the sort %s from the URL", (sort) => {
    expect(parseInvoiceParams({ sort, order: "desc" })).toMatchObject({ sort, order: "desc" });
  });

  it.each([["bonus"], ["TOTAL"], [""], ["__proto__"]])(
    "falls back to what needs action first for the sort %j, which is not one of ours",
    (sort) => {
      expect(parseInvoiceParams({ sort, order: "sideways" })).toMatchObject({ sort: "action", order: "asc" });
    },
  );

  it("leaves the default order out of the address, and carries any other", () => {
    expect(buildInvoiceQuery({ ...DEFAULT_INVOICE_PARAMS, order: "desc" })).toEqual({ order: "desc" });
    expect(buildInvoiceQuery({ ...DEFAULT_INVOICE_PARAMS, sort: "name" })).toEqual({ sort: "name" });
  });

  it("turns the current column around when it is pressed again", () => {
    expect(nextInvoiceSort({ sort: "total", order: "desc" }, "total")).toEqual({ sort: "total", order: "asc" });
    expect(nextInvoiceSort({ sort: "name", order: "asc" }, "name")).toEqual({ sort: "name", order: "desc" });
  });

  it("starts a newly pressed column the way it reads best: names A to Z, amounts largest first", () => {
    expect(nextInvoiceSort({ sort: "action", order: "asc" }, "name")).toEqual({ sort: "name", order: "asc" });
    for (const key of ["fixed", "penalty", "total"] as const) {
      expect(nextInvoiceSort({ sort: "name", order: "asc" }, key)).toEqual({ sort: key, order: "desc" });
    }
  });
});

describe("invoiceExportHref", () => {
  it("asks the export for the filters and the order on show, through the app's own /api", () => {
    expect(
      invoiceExportHref({ q: "salsa", contract: "active", status: "accruing", sort: "total", order: "desc", page: 3 }),
    ).toBe("/api/invoices/export?q=salsa&contract=active&status=accruing&sort=total&order=desc");
  });

  it("asks for everything, in the default order, when nothing is narrowed; the page never matters", () => {
    expect(invoiceExportHref({ ...DEFAULT_INVOICE_PARAMS, page: 4 })).toBe("/api/invoices/export");
  });
});
