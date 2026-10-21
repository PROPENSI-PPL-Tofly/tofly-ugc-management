import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { formatTimestamp } from "@/lib/format";
import { DASH, type InvoiceRow } from "@/lib/invoice";
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

const TODAY = "2026-08-20";

function setup(props: Partial<Props> = {}) {
  const handlers = { onRetry: vi.fn(), onClose: vi.fn(), onOpenContent: vi.fn() };
  render(
    <InvoiceRincian row={ROW} breakdown={BREAKDOWN} status="ready" today={TODAY} {...handlers} {...props} />,
  );
  return handlers;
}

/** One part's row in the Rincian tab, by its title. */
const part = (name: string) => screen.getByRole("group", { name });

/** Opens a part's lines, as the admin presses its row. */
function unfold(name: string) {
  fireEvent.click(within(part(name)).getByRole("button"));
}

describe("InvoiceRincian", () => {
  it("opens as a side panel titled Rincian Invoice, as the creator's page is", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Rincian Invoice" })).toBeInTheDocument();
  });

  it("leads with the creator, the period and the running total, as the creator's page does", () => {
    setup();

    const summary = screen.getByRole("group", { name: "Ringkasan invoice" });
    expect(summary).toHaveTextContent("Adit Prakoso");
    expect(summary).toHaveTextContent("Periode 1 · 2 Mar – 29 Agu 2026");
    expect(summary).toHaveTextContent("Total Sementara");
    expect(summary).toHaveTextContent("Rp350.000");
    expect(within(summary).getByRole("button", { name: "Tentang Total Sementara" })).toBeInTheDocument();
  });

  it("walks the invoice's steps, the current one marked for a screen reader", () => {
    setup();

    const steps = within(screen.getByRole("list", { name: "Progres invoice" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "Berjalan2 Mar 2026",
      "Final",
      "Di-ack Creator",
      "Bukti Bayar",
      "Paid",
    ]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
  });

  it("dates every step a paid invoice reached", () => {
    setup({
      row: {
        ...ROW,
        invoiceStatus: "paid",
        frozenAt: "2026-08-30T03:00:00.000Z",
        payment: {
          acknowledgedAt: "2026-08-31T03:00:00.000Z",
          receivedAt: "2026-09-02T03:00:00.000Z",
          proof: { fileName: "bukti.pdf", href: "/api/invoices/x/payment-proof", uploadedAt: "2026-09-01T03:00:00.000Z" },
        },
      },
    });

    const steps = within(screen.getByRole("list", { name: "Progres invoice" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "Berjalan, selesai2 Mar 2026",
      "Final, selesai30 Agu 2026",
      "Di-ack Creator, selesai31 Agu 2026",
      "Bukti Bayar, selesai1 Sep 2026",
      "Paid, selesai2 Sep 2026",
    ]);
    expect(screen.getByRole("group", { name: "Ringkasan invoice" })).toHaveTextContent("Total Dibayarkan");
  });

  it("lists every part as a row with its amount, a dash for one with nothing in it", () => {
    setup({ row: { ...ROW, extraAmount: 0 }, breakdown: { ...BREAKDOWN, extra: { lines: [], total: 0 } } });

    expect(part("Fixed Rate Kontrak")).toHaveTextContent("Rp400.000");
    expect(part("Fee Konten Tambahan")).toHaveTextContent(DASH);
    expect(within(part("Fee Konten Tambahan")).queryByRole("button")).toBeNull();
    expect(part("Bonus Performa")).toHaveTextContent("Menunggu data");
    expect(part("Penalti")).toHaveTextContent("− Rp150.000");
    expect(part("Penyesuaian")).toHaveTextContent(DASH);
  });

  it("unfolds a part's lines on a press, and says so to a screen reader", () => {
    setup();

    const toggle = within(part("Penalti")).getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    unfold("Penalti");

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(part("Penalti")).getByText("Kembali lagi")).toBeInTheDocument();
  });

  it("opens a content from a part's lines", () => {
    const { onOpenContent } = setup();

    unfold("Penalti");
    fireEvent.click(screen.getByRole("button", { name: "Kembali lagi" }));

    expect(onOpenContent).toHaveBeenCalledWith("c-3");
  });

  it("ends the parts with the total under the admin's word for it, and says the bonus is not in it yet", () => {
    setup();

    const total = screen.getByRole("group", { name: "Total invoice" });
    expect(total).toHaveTextContent("Total Sementara");
    expect(total).toHaveTextContent("Rp350.000");
    expect(total).toHaveTextContent("Belum termasuk bonus performa yang menunggu data.");
  });

  it("says when the penalty used the pay up", () => {
    setup({ row: { ...ROW, bonusAmount: 0, totalAmount: 0, floored: true } });

    const total = screen.getByRole("group", { name: "Total invoice" });
    expect(total).toHaveTextContent("Rp0");
    expect(total).toHaveTextContent("Penalti melebihi pendapatan, total minimal Rp0.");
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

    unfold("Penyesuaian");

    expect(part("Penyesuaian")).toHaveTextContent("− Rp75.000");
    expect(screen.getByText("Koreksi kelebihan tagihan")).toBeInTheDocument();
    expect(screen.getByText(formatTimestamp("2026-10-18T03:00:00.000Z"))).toBeInTheDocument();
  });

  it("calls a frozen invoice's total Total Final", () => {
    setup({ row: { ...ROW, invoiceStatus: "finalized", frozenAt: "2026-10-18T03:00:00.000Z" } });

    expect(screen.getByRole("group", { name: "Total invoice" })).toHaveTextContent("Total Final");
  });

  it("shows the payment proof in the Rincian, once there is one", () => {
    setup({
      row: {
        ...ROW,
        invoiceStatus: "payment_uploaded",
        frozenAt: "2026-08-30T03:00:00.000Z",
        payment: {
          acknowledgedAt: "2026-08-31T03:00:00.000Z",
          receivedAt: null,
          proof: { fileName: "bukti.pdf", href: "/api/invoices/x/payment-proof", uploadedAt: "2026-09-01T03:00:00.000Z" },
        },
      },
    });

    const proof = screen.getByRole("group", { name: "Bukti Bayar" });
    expect(proof).toHaveTextContent("Diupload 1 Sep 2026");
    expect(within(proof).getByRole("link", { name: "Lihat Bukti" })).toHaveAttribute("href", "/api/invoices/x/payment-proof");
  });

  it("keeps the activity and the thread behind their own tab, with the steps in the admin's words", () => {
    setup({
      row: { ...ROW, invoiceStatus: "finalized", frozenAt: "2026-08-30T03:00:00.000Z" },
      thread: <p>Utas komentar</p>,
    });

    expect(screen.queryByText("Utas komentar")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Aktivitas & Komentar (1)" }));

    expect(screen.getByRole("tab", { name: "Aktivitas & Komentar (1)" })).toHaveAttribute("aria-selected", "true");
    const activity = within(screen.getByRole("list", { name: "Aktivitas invoice" }));
    expect(activity.getByText("Invoice difinalisasi")).toBeInTheDocument();
    expect(activity.getByText("30 Agu 2026")).toBeInTheDocument();
    expect(screen.getByText("Utas komentar")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Total invoice" })).toBeNull();
  });

  it("says a running invoice has no activity yet, above its thread", () => {
    setup({ thread: <p>Utas komentar</p> });

    fireEvent.click(screen.getByRole("tab", { name: "Aktivitas & Komentar" }));

    expect(screen.getByText("Belum ada aktivitas.")).toBeInTheDocument();
    expect(screen.getByText("Utas komentar")).toBeInTheDocument();
  });

  it("puts the adjustment form and the proof upload above the tabs, where the admin acts", () => {
    setup({ editor: <form aria-label="Tambah Penyesuaian" />, upload: <p>Unggah bukti</p> });

    const tabs = screen.getByRole("tablist", { name: "Bagian invoice" });
    for (const node of [screen.getByRole("form", { name: "Tambah Penyesuaian" }), screen.getByText("Unggah bukti")]) {
      expect(node.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("says in the footer when a running invoice can be finalized, beside the moves and Tutup", () => {
    setup({ actions: <button type="button">+ Tambah Penyesuaian</button> });

    expect(screen.getByText("Finalize mulai 30 Agu 2026.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Tambah Penyesuaian" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutup" })).toBeInTheDocument();
  });

  it("says Lunas in the footer for a paid invoice, in green and in words", () => {
    setup({ row: { ...ROW, invoiceStatus: "paid", frozenAt: "2026-08-30T03:00:00.000Z" } });

    expect(screen.getByText("Lunas")).toHaveClass("text-green-ink");
  });

  it("closes with Tutup", () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("says it is loading before the breakdown arrives, already titled, with no hint yet", () => {
    setup({ breakdown: null, status: "loading" });

    expect(screen.getByRole("dialog", { name: "Rincian Invoice" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Memuat rincian…");
    expect(screen.queryByText(/Finalize mulai/)).toBeNull();
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
