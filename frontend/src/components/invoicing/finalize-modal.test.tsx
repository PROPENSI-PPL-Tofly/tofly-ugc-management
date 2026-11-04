import { fireEvent, render, screen, within } from "@testing-library/react";
import { formatTimestamp } from "@/lib/format";
import { type InvoiceRow } from "@/lib/invoice";
import { FinalizeModal } from "./finalize-modal";

const moves = vi.hoisted(() => ({
  finalizeInvoice: vi.fn(),
}));

vi.mock("@/lib/invoice-actions.server", () => moves);

const ROW: InvoiceRow = {
  creatorId: "0fcc2741-73b1-4df2-8d64-6c7363862499",
  creatorName: "Rangga Pratama",
  contractId: "11111111-1111-4111-8111-111111111111",
  contractStatus: "expired",
  contractEnd: "2026-10-17",
  fixedAmount: 500000,
  extraAmount: 200000,
  bonusAmount: 150000,
  penaltyAmount: 150000,
  totalAmount: 700000,
  floored: false,
  dataWaiting: false,
  pendingBonus: null,
  periodNumber: 1,
  invoiceStatus: "accruing",
  adjustments: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      amount: -75000,
      reason: "Koreksi kelebihan tagihan",
      createdAt: "2026-10-18T03:00:00.000Z",
    },
  ],
  frozenAt: null,
};

describe("FinalizeModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moves.finalizeInvoice.mockResolvedValue({ ok: true, report: { lastSync: null, bonusGaps: null } });
  });

  // Freezing cannot be undone, so focus starts on the safe answer, as in every other confirmation.
  it("opens with focus on Batal", () => {
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Batal" })).toHaveFocus();
  });

  it("shows the whole breakdown and the total before anything is frozen", () => {
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

    expect(screen.getByText("Rp500.000")).toBeInTheDocument();
    expect(screen.getByText("Rp200.000")).toBeInTheDocument();
    expect(screen.getByText("Rp150.000")).toBeInTheDocument();
    expect(screen.getByText("− Rp150.000")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Total invoice" })).toHaveTextContent("Rp700.000");
    expect(screen.getByText("Koreksi kelebihan tagihan")).toBeInTheDocument();
    expect(screen.getByText("− Rp75.000")).toBeInTheDocument();
    expect(screen.getByText(formatTimestamp("2026-10-18T03:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText(/dikunci dan tidak berubah lagi/)).toBeInTheDocument();
  });

  it("says the bonus is waiting rather than writing a zero", () => {
    render(
      <FinalizeModal
        row={{ ...ROW, bonusAmount: null, totalAmount: 550000 }}
        onCancel={vi.fn()}
        onFinalized={vi.fn()}
      />,
    );

    expect(screen.getByText("Menunggu data")).toBeInTheDocument();
  });

  it("freezes the invoice on confirm and hands it back to be read", async () => {
    const onFinalized = vi.fn();
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={onFinalized} />);

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

    await vi.waitFor(() =>
      expect(moves.finalizeInvoice).toHaveBeenCalledWith(ROW.contractId, { acceptPendingBonus: false }),
    );
    await vi.waitFor(() => expect(onFinalized).toHaveBeenCalled());
  });

  describe("a bonus still waiting for performance data", () => {
    const PENDING: InvoiceRow = {
      ...ROW,
      bonusAmount: null,
      totalAmount: 550000,
      pendingBonus: { amount: 150000, totalAmount: 700000, floored: false },
    };

    it("warns that the bonus is frozen at what was measured, before anything is frozen", () => {
      render(<FinalizeModal row={PENDING} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      expect(screen.getByRole("note")).toHaveTextContent(
        "Bonus performa masih menunggu data. Jika difinalisasi sekarang, bonus dikunci sebesar yang sudah terukur dan konten tanpa data dihitung Rp0. Tambahkan penyesuaian dulu jika masih ada bonus yang perlu dibayar.",
      );
    });

    it("shows the bonus and the total as freezing now would hold them", () => {
      render(<FinalizeModal row={PENDING} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      expect(screen.getByText("Rp150.000")).toBeInTheDocument();
      expect(screen.queryByText("Menunggu data")).not.toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Total invoice" })).toHaveTextContent("Rp700.000");
    });

    it("reads a frozen total the penalty used up as a real Rp0", () => {
      render(
        <FinalizeModal
          row={{ ...PENDING, pendingBonus: { amount: 0, totalAmount: 0, floored: true } }}
          onCancel={vi.fn()}
          onFinalized={vi.fn()}
        />,
      );

      expect(screen.getByRole("group", { name: "Total invoice" })).toHaveTextContent("Rp0");
    });

    it("asks without accepting first, so the admin sees what waits before freezing anyway (AC 9)", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: false,
        code: "INVOICE_BONUS_PENDING",
        message: "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
        report: { lastSync: null, bonusGaps: { available: false, reason: "PBI_28_1_PENDING" } },
      });
      render(<FinalizeModal row={PENDING} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
      await vi.waitFor(() =>
        expect(moves.finalizeInvoice).toHaveBeenCalledWith(ROW.contractId, { acceptPendingBonus: false }),
      );

      fireEvent.click(await screen.findByRole("button", { name: "Finalize tetap" }));
      await vi.waitFor(() =>
        expect(moves.finalizeInvoice).toHaveBeenLastCalledWith(ROW.contractId, {
          acceptPendingBonus: true,
        }),
      );
    });
  });

  it("names which contract's invoice it freezes when the creator has more than one", () => {
    render(<FinalizeModal row={{ ...ROW, periodNumber: 2 }} onCancel={vi.fn()} onFinalized={vi.fn()} />);

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Finalize invoice Rangga Pratama · Periode 2");
  });

  it("warns of no pending bonus when the bonus is measured", () => {
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open with the refusal when the server will not freeze", async () => {
    const onFinalized = vi.fn();
    moves.finalizeInvoice.mockResolvedValue({
      ok: false,
      code: "CONTRACT_NOT_ENDED",
      message: "Kontrak belum berakhir",
    });
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={onFinalized} />);

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Kontrak belum berakhir"),
    );
    expect(onFinalized).not.toHaveBeenCalled();
  });

  it("says only that the request could not go through when it throws", async () => {
    moves.finalizeInvoice.mockRejectedValue(new Error("fetch failed"));
    render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Permintaan tidak dapat diproses. Coba lagi."),
    );
  });

  it("changes nothing on Batal", () => {
    const onCancel = vi.fn();
    render(<FinalizeModal row={ROW} onCancel={onCancel} onFinalized={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onCancel).toHaveBeenCalled();
    expect(moves.finalizeInvoice).not.toHaveBeenCalled();
  });

  describe("its states at Finalize (AC 7, 8, 9)", () => {
    it("says it is taking the newest numbers while the freeze runs (AC 7)", async () => {
      let settle!: (outcome: unknown) => void;
      moves.finalizeInvoice.mockReturnValue(new Promise((resolve) => (settle = resolve)));
      render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

      expect(await screen.findByRole("status")).toHaveTextContent("Mengambil angka terbaru…");
      expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Finalize" })).toBeDisabled();

      settle({ ok: true, report: { lastSync: null, bonusGaps: null } });
    });

    it("names the links the last sync did not update before closing (AC 8)", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: true,
        report: {
          lastSync: {
            status: "failed",
            notUpdated: [
              {
                contentId: "c-1",
                contentName: "Evg_1_RanggaPratama_12102026",
                platform: "tiktok",
                state: "sync_failed",
              },
            ],
          },
          bonusGaps: null,
        },
      });
      const onFinalized = vi.fn();
      render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={onFinalized} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

      const left = await screen.findByRole("group", { name: "Link yang tidak diperbarui" });
      expect(within(left).getByText(/Evg_1_RanggaPratama_12102026/)).toBeInTheDocument();
      expect(within(left).getByText("Gagal sinkron")).toBeInTheDocument();
      expect(onFinalized).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Selesai" }));
      expect(onFinalized).toHaveBeenCalled();
    });

    it("closes at once when the last sync updated everything (AC 8)", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: true,
        report: { lastSync: { status: "done", notUpdated: [] }, bonusGaps: null },
      });
      const onFinalized = vi.fn();
      render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={onFinalized} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

      await vi.waitFor(() => expect(onFinalized).toHaveBeenCalled());
    });

    it("lists each waiting content with its state beside Finalize tetap (AC 9)", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: false,
        code: "INVOICE_BONUS_PENDING",
        message: "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
        report: {
          lastSync: null,
          bonusGaps: {
            available: true,
            waiting: [
              {
                contentId: "c-2",
                contentName: "Review Kopi",
                platform: "instagram",
                metric: "views",
                state: "not_connected",
              },
              {
                contentId: "c-3",
                contentName: "Kembali lagi",
                platform: "tiktok",
                metric: "likes",
                state: "waiting",
              },
            ],
          },
        },
      });
      render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

      const waiting = await screen.findByRole("group", { name: "Konten yang masih menunggu data" });
      expect(within(waiting).getByText(/Review Kopi/)).toBeInTheDocument();
      expect(within(waiting).getByText("Akun belum terhubung")).toBeInTheDocument();
      expect(within(waiting).getByText(/Kembali lagi/)).toBeInTheDocument();
      expect(within(waiting).getByText("Menunggu data")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Finalize tetap" })).toBeInTheDocument();
    });

    it("says the waiting list is not available until PBI-28.1 rather than showing an empty one (AC 9)", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: false,
        code: "INVOICE_BONUS_PENDING",
        message: "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
        report: { lastSync: null, bonusGaps: { available: false, reason: "PBI_28_1_PENDING" } },
      });
      render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

      expect(await screen.findByText(/belum tersedia hingga PBI-28\.1/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Finalize tetap" })).toBeInTheDocument();
    });

    it("opens the waiting content's detail, where the admin can type its numbers (AC 9)", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: false,
        code: "INVOICE_BONUS_PENDING",
        message: "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
        report: {
          lastSync: null,
          bonusGaps: {
            available: true,
            waiting: [
              {
                contentId: "c-2",
                contentName: "Review Kopi",
                platform: "instagram",
                metric: "views",
                state: "not_connected",
              },
            ],
          },
        },
      });
      const onOpenContent = vi.fn();
      render(
        <FinalizeModal
          row={ROW}
          onCancel={vi.fn()}
          onFinalized={vi.fn()}
          onOpenContent={onOpenContent}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
      const waiting = await screen.findByRole("group", { name: "Konten yang masih menunggu data" });

      fireEvent.click(within(waiting).getByRole("button", { name: "Review Kopi" }));

      expect(onOpenContent).toHaveBeenCalledWith("c-2");
    });

    it("keeps a waiting name plain when no content can be opened", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: false,
        code: "INVOICE_BONUS_PENDING",
        message: "Bonus performa masih menunggu data. Konfirmasi untuk mengunci bonus yang sudah terukur.",
        report: {
          lastSync: null,
          bonusGaps: {
            available: true,
            waiting: [
              {
                contentId: "c-2",
                contentName: "Review Kopi",
                platform: "instagram",
                metric: "views",
                state: "not_connected",
              },
            ],
          },
        },
      });
      render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
      const waiting = await screen.findByRole("group", { name: "Konten yang masih menunggu data" });

      expect(within(waiting).queryByRole("button", { name: "Review Kopi" })).not.toBeInTheDocument();
      expect(within(waiting).getByText(/Review Kopi/)).toBeInTheDocument();
    });

    it("keeps a refusal for another reason visible as before", async () => {
      moves.finalizeInvoice.mockResolvedValue({
        ok: false,
        code: "CONTRACT_NOT_ENDED",
        message: "Kontrak belum berakhir",
        report: { lastSync: null, bonusGaps: null },
      });
      render(<FinalizeModal row={ROW} onCancel={vi.fn()} onFinalized={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

      expect(await screen.findByText("Kontrak belum berakhir")).toBeInTheDocument();
    });
  });
});
