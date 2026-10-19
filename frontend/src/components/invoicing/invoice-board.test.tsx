import { fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceRow } from "@/lib/invoice";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { InvoiceBoard } from "./invoice-board";

const { refresh, load, replace } = vi.hoisted(() => ({ refresh: vi.fn(), load: vi.fn(), replace: vi.fn() }));
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => "/admin/invoicing",
  useSearchParams: () => searchParams,
}));

// The real loader is a server action; here it answers from the breakdown below.
vi.mock("@/lib/invoice-breakdown.server", () => ({ loadInvoiceBreakdown: load }));

// The invoice moves are server actions too; here every move is accepted.
vi.mock("@/lib/invoice-actions.server", () => ({
  addInvoiceAdjustment: vi.fn().mockResolvedValue({ ok: true }),
  finalizeInvoice: vi.fn().mockResolvedValue({ ok: true }),
}));

// The panel is tested where it lives; here it only offers the decision the board must answer.
vi.mock("@/components/content-detail/content-detail-panel", () => ({
  ContentDetailPanel: ({ onDecided }: { onDecided: (decision: "approve") => void }) => (
    <button type="button" onClick={() => onDecided("approve")}>
      Setujui
    </button>
  ),
}));

const ROW: InvoiceRow = {
  creatorId: "creator-rangga",
  creatorName: "Rangga Pratama",
  contractStatus: "active",
  fixedAmount: 500000,
  extraAmount: 500000,
  bonusAmount: null,
  penaltyAmount: 0,
  totalAmount: 0,
  floored: false,
  invoiceStatus: "accruing",
  contractId: "11111111-1111-4111-8111-111111111111",
  contractEnd: "2026-12-31",
  adjustments: [],
  frozenAt: null,
  dataWaiting: false,
  pendingBonus: null,
};

const BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: {
    period: { number: 1, start: "2026-09-01", end: "2026-11-30", quotaDone: 1, quotaTotal: 10 },
    total: 500000,
    notStarted: false,
  },
  extra: {
    lines: [{ contentId: "c-1", name: "Evg_1_Rangga", rate: 500000, amount: 500000 }],
    total: 500000,
  },
  bonus: { lines: [], total: 0, performance: "waiting", rules: { tiers: [], specificBonus: 0 } },
  penalty: { lines: [], total: 0 },
};

describe("InvoiceBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    load.mockResolvedValue(BREAKDOWN);
  });

  it("draws the Rate & Invoicing table with its money cells as breakdown triggers", () => {
    render(<InvoiceBoard rows={[ROW]} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fixed Rate Rangga Pratama: Rp500.000, lihat rincian" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bonus Rangga Pratama: Menunggu data, lihat rincian" }),
    ).toBeInTheDocument();
  });

  it("opens a column's breakdown from its cell", async () => {
    render(<InvoiceBoard rows={[ROW]} />);

    fireEvent.click(screen.getByRole("button", { name: /^Konten Tambahan Rangga Pratama/ }));

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Fee Konten Tambahan · Rangga Pratama");
    expect(await screen.findByRole("list")).toHaveTextContent("Evg_1_Rangga");
    expect(load).toHaveBeenCalledWith("creator-rangga");
  });

  it("reads the invoices again after a decision taken from a breakdown", async () => {
    render(<InvoiceBoard rows={[ROW]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Konten Tambahan Rangga Pratama/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Evg_1_Rangga" }));

    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  describe("sorting", () => {
    it("sorts by a pressed column through the address, back on page one, keeping the filters", () => {
      searchParams = new URLSearchParams("q=rangga&page=3");
      render(<InvoiceBoard rows={[ROW]} sort={{ key: "action", order: "asc" }} />);

      fireEvent.click(screen.getByRole("button", { name: /^Total/ }));

      expect(replace).toHaveBeenCalledWith("/admin/invoicing?q=rangga&sort=total&order=desc", { scroll: false });
    });

    it("turns the sorted column around when it is pressed again", () => {
      searchParams = new URLSearchParams("sort=total&order=desc");
      render(<InvoiceBoard rows={[ROW]} sort={{ key: "total", order: "desc" }} />);

      fireEvent.click(screen.getByRole("button", { name: /^Total/ }));

      expect(replace).toHaveBeenCalledWith("/admin/invoicing?sort=total&order=asc", { scroll: false });
    });

    it("leaves the default order out of the address", () => {
      searchParams = new URLSearchParams("sort=name&order=desc");
      render(<InvoiceBoard rows={[ROW]} sort={{ key: "name", order: "desc" }} />);

      fireEvent.click(screen.getByRole("button", { name: "Fixed Rate" }));

      expect(replace).toHaveBeenCalledWith("/admin/invoicing?sort=fixed&order=desc", { scroll: false });
    });
  });

  it("offers a Rincian button per row that opens the whole invoice", async () => {
    render(<InvoiceBoard rows={[ROW]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Rangga Pratama" }));

    expect(await screen.findByRole("dialog", { name: "Rincian Invoice · Rangga Pratama" })).toBeInTheDocument();
  });

  it("reads the invoices again after an adjustment added from the Rincian panel", async () => {
    render(<InvoiceBoard rows={[ROW]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Rangga Pratama" }));
    fireEvent.click(await screen.findByRole("button", { name: "+ Tambah Penyesuaian" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Nominal (Rp)" }), { target: { value: "50000" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Alasan" }), { target: { value: "Bonus kampanye" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds up the period under the table when it is given the summary", () => {
    render(<InvoiceBoard rows={[ROW]} summary={{ total: 900000, count: 3 }} />);

    expect(screen.getByText("Total 3 creator")).toBeInTheDocument();
    expect(screen.getByText("Rp900.000")).toBeInTheDocument();
  });
});
