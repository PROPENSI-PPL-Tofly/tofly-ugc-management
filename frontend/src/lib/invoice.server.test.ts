import { RAW_RANGGA } from "./invoice-api.fixture";
import type { RawInvoiceList } from "./invoice-api";
import { DEFAULT_INVOICE_PARAMS, type InvoiceParams } from "./invoice";

const { sessionCookies } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
}));

// The browser's cookies as the server reads them; here whatever a test puts in.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
}));

import { fetchRateInvoices } from "./invoice.server";

const ANSWER: RawInvoiceList = {
  items: [RAW_RANGGA],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
  summary: { total: 550000, runningInvoices: 1, formulaSet: true },
};

function params(over: Partial<InvoiceParams> = {}): InvoiceParams {
  return { ...DEFAULT_INVOICE_PARAMS, ...over };
}

function answer(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("fetchRateInvoices", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
  });

  it("asks GET /invoices for the page's filters, with the session and nothing cached", async () => {
    const fetch = answer(ANSWER);
    sessionCookies.push({ name: "__session", value: "abc" }, { name: "other", value: "x" });

    await fetchRateInvoices(params({ q: "rangga", status: "accruing", page: 2 }));

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/invoices?q=rangga&status=accruing&page=2&pageSize=10",
      { cache: "no-store", headers: { cookie: "__session=abc" } },
    );
  });

  it("sends no cookie header when the browser has no session", async () => {
    const fetch = answer(ANSWER);

    await fetchRateInvoices(params());

    expect(fetch).toHaveBeenCalledWith(expect.any(String), { cache: "no-store" });
  });

  it("hands the rows to the table in the table's own names", async () => {
    answer(ANSWER);

    const list = await fetchRateInvoices(params());

    expect(list).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    expect(list.rows[0]).toMatchObject({ creatorName: "Rangga Pratama", totalAmount: 550000 });
  });

  it.each([401, 403, 500])(
    "throws on HTTP %i, so the page offers a retry instead of an empty table",
    async (status) => {
      answer({ code: "ANY" }, status);

      await expect(fetchRateInvoices(params())).rejects.toThrow(
        `Loading the invoices failed with HTTP ${status}`,
      );
    },
  );

  it("throws when BACKEND_URL is missing, before asking anyone", async () => {
    vi.stubEnv("BACKEND_URL", undefined);
    const fetch = answer(ANSWER);

    await expect(fetchRateInvoices(params())).rejects.toThrow("BACKEND_URL is not configured");
    expect(fetch).not.toHaveBeenCalled();
  });
});
