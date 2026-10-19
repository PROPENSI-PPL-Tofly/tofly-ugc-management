import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { aCreatorInvoice, NONE_REACHED } from "@/lib/creator-invoice.builder";
import { acknowledgeInvoice, addInvoiceComment } from "@/lib/creator-invoice-actions.server";
import { CreatorInvoices } from "./creator-invoices";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The moves are server actions; here every move is accepted.
vi.mock("@/lib/creator-invoice-actions.server", () => ({
  acknowledgeInvoice: vi.fn().mockResolvedValue({ ok: true }),
  confirmInvoicePayment: vi.fn().mockResolvedValue({ ok: true }),
  addInvoiceComment: vi.fn().mockResolvedValue({ ok: true }),
}));

// The panel is tested where it lives; here it only says which content it was opened on, for whom.
vi.mock("@/components/content-detail/content-detail-panel", () => ({
  ContentDetailPanel: ({ contentId, role, onClose }: { contentId: string; role: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Detail konten">
      {`${role}:${contentId}`}
      <button type="button" onClick={onClose}>
        Tutup detail
      </button>
    </div>
  ),
}));

const CURRENT = aCreatorInvoice({ periodNumber: 2, periodStart: "2026-09-01", totalAmount: 550000 });
const EARLIER = aCreatorInvoice({
  contractId: "5a5a5a5a-0000-4000-8000-000000000001",
  periodNumber: 1,
  periodStart: "2026-06-01",
  periodEnd: "2026-08-31",
  status: "paid",
  totalAmount: 1200000,
});

function panel(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("CreatorInvoices", () => {
  it("shows the latest period's invoice in full, whatever order the list came in", () => {
    render(<CreatorInvoices invoices={[EARLIER, CURRENT]} />);

    const current = panel("Invoice Periode Ini");
    expect(within(current).getByRole("group", { name: "Ringkasan invoice" })).toHaveTextContent("Periode 2");
  });

  it("lists the earlier periods in the history", () => {
    render(<CreatorInvoices invoices={[EARLIER, CURRENT]} />);

    const history = panel("Riwayat Invoice");
    expect(within(history).getAllByRole("row")).toHaveLength(2);
    expect(history).toHaveTextContent("Rp1.200.000");
  });

  it("says there is no invoice yet when the creator has none, and lists no history", () => {
    render(<CreatorInvoices invoices={[]} />);

    expect(panel("Invoice Periode Ini")).toHaveTextContent("Belum ada invoice.");
    expect(screen.queryByRole("region", { name: "Riwayat Invoice" })).not.toBeInTheDocument();
  });

  it("opens an earlier invoice in full from the history, and closes it again", () => {
    render(<CreatorInvoices invoices={[EARLIER, CURRENT]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Periode 1" }));

    const dialog = screen.getByRole("dialog", { name: "Invoice Periode 1" });
    expect(within(dialog).getByRole("group", { name: "Ringkasan invoice" })).toHaveTextContent("Total Dibayarkan");

    fireEvent.click(within(dialog).getAllByRole("button", { name: "Tutup" }).at(-1)!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes an earlier invoice on Escape too", () => {
    render(<CreatorInvoices invoices={[EARLIER, CURRENT]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Periode 1" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a content's detail as the creator from the current invoice", () => {
    render(<CreatorInvoices invoices={[CURRENT]} />);
    const current = panel("Invoice Periode Ini");
    fireEvent.click(within(current).getByRole("button", { name: /^Penalti/ }));

    fireEvent.click(within(current).getByRole("button", { name: "Cara lacak paket" }));

    expect(screen.getByRole("dialog", { name: "Detail konten" })).toHaveTextContent(
      "creator:a1a1a1a1-0000-4000-8000-000000000004",
    );
  });

  it("keeps one layer on screen: the history invoice steps aside for a content and comes back after", () => {
    render(<CreatorInvoices invoices={[EARLIER, CURRENT]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Periode 1" }));
    const dialog = screen.getByRole("dialog", { name: "Invoice Periode 1" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Penalti/ }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Cara lacak paket" }));

    expect(screen.queryByRole("dialog", { name: "Invoice Periode 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Detail konten" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tutup detail" }));

    expect(screen.queryByRole("dialog", { name: "Detail konten" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Invoice Periode 1" })).toBeInTheDocument();
  });

  describe("the creator's moves", () => {
    const FINALIZED = aCreatorInvoice({
      periodNumber: 2,
      status: "finalized",
      reachedAt: { ...NONE_REACHED, finalized: "2026-12-01T02:00:00Z" },
    });
    const EARLIER_FINALIZED = { ...FINALIZED, contractId: "5a5a5a5a-0000-4000-8000-000000000001", periodNumber: 1 };

    beforeEach(() => {
      refresh.mockClear();
    });

    it("acknowledges the current invoice from its turn banner, then reads the invoices again and says so", async () => {
      render(<CreatorInvoices invoices={[FINALIZED]} />);
      const turn = screen.getByRole("region", { name: "Giliran kamu" });
      fireEvent.click(within(turn).getByRole("button", { name: "Acknowledge Invoice" }));

      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Acknowledge" }));

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(acknowledgeInvoice).toHaveBeenCalledWith(FINALIZED.contractId);
      expect(screen.getByText("Invoice sudah di-acknowledge.")).toBeInTheDocument();
    });

    it("offers an earlier contract's move inside its Rincian too", () => {
      render(<CreatorInvoices invoices={[EARLIER_FINALIZED, CURRENT]} />);

      fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Periode 1" }));

      const dialog = screen.getByRole("dialog", { name: "Invoice Periode 1" });
      expect(within(dialog).getByRole("button", { name: "Acknowledge Invoice" })).toBeInTheDocument();
    });

    it("shows an open earlier invoice as it reads after the invoices are read again", () => {
      const { rerender } = render(<CreatorInvoices invoices={[EARLIER_FINALIZED, CURRENT]} />);
      fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Periode 1" }));

      rerender(<CreatorInvoices invoices={[{ ...EARLIER_FINALIZED, status: "creator_acked" }, CURRENT]} />);

      expect(screen.getByRole("dialog", { name: "Invoice Periode 1" })).toHaveTextContent(
        "Menunggu bukti bayar dari Admin.",
      );
    });

    it("closes an earlier invoice that is no longer listed after the invoices are read again", () => {
      const { rerender } = render(<CreatorInvoices invoices={[EARLIER, CURRENT]} />);
      fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Periode 1" }));

      rerender(<CreatorInvoices invoices={[CURRENT]} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("reads the invoices again after a comment is sent", async () => {
      render(<CreatorInvoices invoices={[CURRENT]} />);
      fireEvent.click(screen.getByRole("tab", { name: /Aktivitas/ }));
      fireEvent.change(screen.getByRole("textbox", { name: "Komentar" }), { target: { value: "Halo Admin" } });

      fireEvent.click(screen.getByRole("button", { name: "Kirim Komentar" }));

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(addInvoiceComment).toHaveBeenCalledWith(CURRENT.contractId, "Halo Admin");
    });
  });
});
