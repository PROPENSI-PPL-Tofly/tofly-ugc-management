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

const FORMULA = "Final Rate = Fixed Rate + Konten Tambahan + Bonus − Penalti";

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
        invoiceStatus: "accruing",
      },
    ],
    page: 1,
    total: 24,
    totalPages: 3,
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

  it("titles the page and keeps the formula behind the question mark", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Rate & Invoicing" })).toBeInTheDocument();
    expect(screen.getByTitle(FORMULA)).toBeInTheDocument();
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
      page: 2,
    });
  });

  it("lists the creators with their amounts and where the invoice stands", async () => {
    await renderPage();

    expect(screen.getByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Kontrak Aktif")).toBeInTheDocument();
    expect(screen.getByText("Rp5.000.000")).toBeInTheDocument();
    expect(screen.getByText("-Rp250.000")).toBeInTheDocument();
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
            invoiceStatus: "accruing",
          },
        ],
      }),
    );

    await renderPage();

    expect(screen.getAllByText("Menunggu data")).toHaveLength(2);
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
});
