import { fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceRow } from "@/lib/invoice";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { InvoiceBoard } from "./invoice-board";

const { refresh, load } = vi.hoisted(() => ({ refresh: vi.fn(), load: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The real loader is a server action; here it answers from the breakdown below.
vi.mock("@/lib/invoice-breakdown.server", () => ({ loadInvoiceBreakdown: load }));

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
  invoiceStatus: "accruing",
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
});
