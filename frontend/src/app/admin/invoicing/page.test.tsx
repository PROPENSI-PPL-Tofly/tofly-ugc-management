import { render, screen, within } from "@testing-library/react";
import type { InvoiceList } from "@/lib/invoice";
import RateInvoicingPage from "./page";

const { fetchList } = vi.hoisted(() => ({ fetchList: vi.fn() }));

vi.mock("@/lib/invoice.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoice.server")>()),
  fetchRateInvoices: (state: unknown) => fetchList(state),
}));

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/invoicing",
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

vi.mock("@/lib/use-url-filters", () => ({
  useUrlFilters: () => ({
    search: "",
    setSearch: vi.fn(),
    param: () => "all",
    listParam: () => "all",
    setParam: vi.fn(),
    reset: vi.fn(),
    resetKeeping: vi.fn(),
    pending: false,
  }),
  SEARCH_DEBOUNCE_MS: 300,
  MAX_SEARCH_LENGTH: 100,
}));

const FORMULA =
  "Total = Fixed Rate + Fee Konten Tambahan + Bonus Performa − Penalti. Bonus yang masih menunggu data belum dihitung.";

function listOf(overrides: Partial<InvoiceList> = {}): InvoiceList {
  return {
    rows: [
      {
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
        contractId: "11111111-1111-4111-8111-111111111111",
        contractEnd: "2026-12-31",
        adjustments: [],
        frozenAt: null,
        dataWaiting: false,
        pendingBonus: null,
        periodNumber: 1,
      },
    ],
    page: 1,
    total: 24,
    totalPages: 3,
    summary: { total: 9800000, runningInvoices: 24, formulaSet: true },
    ...overrides,
  };
}

async function renderPage(params: Record<string, string> = {}) {
  searchParams = new URLSearchParams(params);
  const result = await RateInvoicingPage({
    searchParams: Promise.resolve(params) as Promise<
      Record<string, string | string[] | undefined>
    >,
  });
  return render(<>{result}</>);
}

describe("Rate & Invoicing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    fetchList.mockResolvedValue(listOf());
  });

  it("titles the page and explains the formula behind an ⓘ a keyboard can reach", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Rate & Invoicing" })).toBeInTheDocument();
    const tip = screen.getByRole("button", { name: "Info rumus Total" });
    expect(tip).toHaveAccessibleDescription(FORMULA);
    // Not a title: a hover-only hint no keyboard or touch can open.
    expect(screen.queryByTitle(FORMULA)).not.toBeInTheDocument();
  });

  // Subtask 8.2: the Atur Formula Rate button sits in the panel head, beside the title.
  it("has the Atur Formula Rate button in the panel head", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: /atur formula rate/i })).toBeInTheDocument();
  });

  it("asks the list for the URL's own parsed state, filters and page", async () => {
    await renderPage({ q: "pw", contract: "active", status: "paid", page: "2" });

    expect(fetchList).toHaveBeenCalledWith({
      q: "pw",
      contract: "active",
      status: "paid",
      sort: "action",
      order: "asc",
      page: 2,
    });
  });

  it("lists the creators with their amounts and where the invoice stands", async () => {
    await renderPage();

    expect(screen.getByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Kontrak Aktif")).toBeInTheDocument();
    expect(screen.getByText("Rp5.000.000")).toBeInTheDocument();
    expect(screen.getByText("− Rp250.000")).toBeInTheDocument();
    // Inside the table: the filter bar offers the same word as a choice.
    expect(within(screen.getByRole("table")).getByText("Berjalan")).toBeInTheDocument();
  });

  it("counts the creators in the footer", async () => {
    await renderPage();

    expect(screen.getByText(/Menampilkan 1.10 dari 24 creator/)).toBeInTheDocument();
  });

  it("keeps the pagination on show even on a single page", async () => {
    fetchList.mockResolvedValue(listOf({ total: 1, totalPages: 1 }));

    await renderPage();

    expect(screen.getByText("Sebelumnya")).toBeInTheDocument();
    expect(screen.getByText("Berikutnya")).toBeInTheDocument();
  });

  it("says the bonus is still waiting where the performance data is not in", async () => {
    fetchList.mockResolvedValue(
      listOf({
        rows: [
          {
            creatorId: "creator-dimas",
            creatorName: "Dimas Aji",
            contractStatus: "active",
            fixedAmount: 4500000,
            extraAmount: 0,
            bonusAmount: null,
            penaltyAmount: 0,
            totalAmount: 4500000,
            floored: false,
            invoiceStatus: "accruing",
        contractId: "11111111-1111-4111-8111-111111111111",
        contractEnd: "2026-12-31",
        adjustments: [],
        frozenAt: null,
        dataWaiting: false,
        pendingBonus: null,
        periodNumber: 1,
          },
        ],
      }),
    );

    await renderPage();

    expect(screen.getAllByText("Menunggu data")).toHaveLength(1);
    expect(screen.getAllByText("Rp4.500.000")).toHaveLength(2);
  });

  it("says how many creators there are when there are none", async () => {
    fetchList.mockResolvedValue(listOf({ rows: [], total: 0, totalPages: 1 }));

    await renderPage();

    expect(screen.getByText("Menampilkan 0 creator")).toBeInTheDocument();
  });

  it("offers a retry that keeps the URL when the list cannot load", async () => {
    fetchList.mockRejectedValue(new Error("backend down"));

    await renderPage({ q: "pw", status: "accruing", page: "3" });

    expect(screen.getByRole("alert")).toHaveTextContent(/tidak bisa dimuat/i);
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/admin/invoicing?q=pw&status=accruing&page=3",
    );
  });

  it("lets each money cell open its breakdown, through the 8.5 triggers", async () => {
    await renderPage();

    expect(
      screen.getByRole("button", { name: "Fixed Rate Rangga Pratama: Rp5.000.000, lihat rincian" }),
    ).toBeInTheDocument();
  });

  describe("the flow around the table", () => {
    const SUMMARY = { total: 9800000, runningInvoices: 24, formulaSet: true };

    it("warns that nothing but the fixed rate is counted while no formula is saved", async () => {
      fetchList.mockResolvedValue(listOf({ summary: { ...SUMMARY, formulaSet: false } }));

      await renderPage();

      expect(screen.getByRole("status", { name: "Formula rate belum diatur" })).toHaveTextContent(
        "Formula rate belum diatur. Fee konten tambahan dan penalti belum dihitung sampai formula disimpan lewat Atur Formula Rate.",
      );
    });

    it("says nothing about the formula once it is saved", async () => {
      await renderPage();

      expect(screen.queryByRole("status", { name: "Formula rate belum diatur" })).not.toBeInTheDocument();
    });

    it("adds up the whole filtered list under the table", async () => {
      await renderPage();

      expect(screen.getByText("Total 24 creator")).toBeInTheDocument();
      expect(screen.getByText("Rp9.800.000")).toBeInTheDocument();
    });

    it("asks the list for the order in the URL", async () => {
      await renderPage({ sort: "penalty", order: "asc" });

      expect(fetchList).toHaveBeenCalledWith(expect.objectContaining({ sort: "penalty", order: "asc" }));
    });
  });
});
