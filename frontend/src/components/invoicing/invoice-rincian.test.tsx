import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { formatTimestamp } from "@/lib/format";
import type { InvoiceRow } from "@/lib/invoice";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { InvoiceRincian } from "./invoice-rincian";

const ROW: InvoiceRow = {
  creatorId: "creator-adit",
  creatorName: "Adit Prakoso",
  contractId: "11111111-1111-4111-8111-111111111111",
  contractStatus: "expired",
  contractEnd: "2026-08-29",
  fixedAmount: 400000,
  extraAmount: 100000,
  bonusAmount: null,
  penaltyAmount: 150000,
  totalAmount: 350000,
  floored: false,
  dataWaiting: true,
  pendingBonus: null,
  periodNumber: 1,
  invoiceStatus: "accruing",
  adjustments: [],
  frozenAt: null,
};

const BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Adit Prakoso",
  fixed: {
    period: { number: 2, start: "2026-03-02", end: "2026-08-29", quotaDone: 2, quotaTotal: 6 },
    total: 400000,
    notStarted: false,
  },
  extra: {
    lines: [
      { contentId: "c-1", name: "Promo tepat", rate: 100000, amount: 100000, late: false },
      { contentId: "c-2", name: "Promo telat", rate: 100000, amount: 0, late: true },
    ],
    total: 100000,
  },
  bonus: {
    lines: [],
    total: 0,
    performance: "waiting",
    rules: { tiers: [{ platform: "instagram", metric: "views", steps: [{ min: 10000, bonus: 150000 }] }], specificBonus: 100000 },
  },
  penalty: {
    lines: [
      { contentId: "c-3", name: "Kembali lagi", daysLate: 11, chargedDays: 3, ratePerDay: 50000, amount: 150000, ongoing: false },
    ],
    total: 150000,
  },
};

type Props = ComponentProps<typeof InvoiceRincian>;

function setup(props: Partial<Props> = {}) {
  const handlers = { onRetry: vi.fn(), onClose: vi.fn(), onOpenContent: vi.fn() };
  render(<InvoiceRincian row={ROW} breakdown={BREAKDOWN} status="ready" {...handlers} {...props} />);
  return handlers;
}

const section = (name: string) => screen.getByRole("region", { name });

describe("InvoiceRincian", () => {
  it("opens as a side panel titled after the creator", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Rincian Invoice · Adit Prakoso" })).toBeInTheDocument();
  });

  it("says where the contract and the invoice stand, in words", () => {
    setup();

    expect(screen.getByText("Kontrak Berakhir")).toBeInTheDocument();
    expect(screen.getByText("Berjalan")).toBeInTheDocument();
  });

  it("shows every part of the invoice in the table's order, each with its own lines and total", () => {
    setup();

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Fixed Rate Kontrak",
      "Fee Konten Tambahan",
      "Bonus Performa",
      "Penalti",
    ]);
    expect(within(section("Fixed Rate Kontrak")).getByText("Kontrak Periode 2")).toBeInTheDocument();
    expect(within(section("Fee Konten Tambahan")).getByText("Telat — tidak dibayar")).toBeInTheDocument();
    expect(within(section("Bonus Performa")).getByText("Bonus performa: Menunggu data")).toBeInTheDocument();
    expect(within(section("Penalti")).getAllByText("− Rp150.000")).toHaveLength(2);
  });

  it("ends with the invoice's total as the table shows it, and says the bonus is not in it yet", () => {
    setup();

    const total = screen.getByRole("group", { name: "Total invoice" });
    expect(total).toHaveTextContent("Rp350.000");
    expect(total).toHaveTextContent("Belum termasuk bonus performa yang menunggu data.");
  });

  it("says when the penalty used the pay up", () => {
    setup({ row: { ...ROW, bonusAmount: 0, totalAmount: 0, floored: true } });

    const total = screen.getByRole("group", { name: "Total invoice" });
    expect(total).toHaveTextContent("Rp0");
    expect(total).toHaveTextContent("Penalti melebihi pembayaran");
    expect(total).not.toHaveTextContent("Belum termasuk bonus");
  });

  it("opens a content from any part of the invoice", () => {
    const { onOpenContent } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Kembali lagi" }));

    expect(onOpenContent).toHaveBeenCalledWith("c-3");
  });

  it("leaves room for what the invoice pipeline will add (PBI-12), beside Tutup", () => {
    setup({ actions: <button type="button">Finalize</button> });

    expect(screen.getByRole("button", { name: "Finalize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutup" })).toBeInTheDocument();
  });

  it("lists each manual adjustment with its reason, its moment and what it moved", () => {
    setup({
      row: {
        ...ROW,
        adjustments: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            amount: -75000,
            reason: "Koreksi kelebihan tagihan",
            createdAt: "2026-10-18T03:00:00.000Z",
          },
        ],
      },
    });

    expect(screen.getByRole("region", { name: "Penyesuaian manual" })).toBeInTheDocument();
    expect(screen.getByText("Koreksi kelebihan tagihan")).toBeInTheDocument();
    expect(screen.getByText(formatTimestamp("2026-10-18T03:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText("− Rp75.000")).toBeInTheDocument();
  });

  it("marks a frozen invoice with the prototype's Final word", () => {
    setup({
      row: {
        ...ROW,
        invoiceStatus: "finalized",
        frozenAt: "2026-10-18T03:00:00.000Z",
      },
    });

    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.queryByText("Berjalan")).not.toBeInTheDocument();
  });

  it("keeps adjustments and the Final word out of the panel while there are none", () => {
    setup();

    expect(screen.queryByRole("region", { name: "Penyesuaian manual" })).not.toBeInTheDocument();
    expect(screen.queryByText("Final")).not.toBeInTheDocument();
  });

  it("closes with Tutup", () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("says it is loading before the breakdown arrives, already titled", () => {
    setup({ breakdown: null, status: "loading" });

    expect(screen.getByRole("dialog", { name: "Rincian Invoice · Adit Prakoso" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Memuat rincian…");
  });

  it("offers a retry when the breakdown could not be read", () => {
    const { onRetry } = setup({ breakdown: null, status: "failed" });

    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Rincian tidak bisa dimuat.");
    expect(onRetry).toHaveBeenCalled();
  });

  it("says when there is nothing to show, without a retry", () => {
    setup({ breakdown: null, status: "missing" });

    expect(screen.getByText("Tidak ada rincian untuk creator ini.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).not.toBeInTheDocument();
  });
});
