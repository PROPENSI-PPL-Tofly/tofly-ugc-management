import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CreatorInvoice, CreatorInvoiceAction } from "@/lib/creator-invoice";
import { aCreatorInvoice, NONE_REACHED } from "@/lib/creator-invoice.builder";
import { CreatorInvoiceView } from "./creator-invoice-view";

const PROOF = {
  url: "https://files.tofly.test/proofs/rangga-1.pdf?token=abc",
  fileName: "transfer-rangga-agustus.pdf",
  uploadedAt: "2026-09-05T02:00:00Z",
};

function renderView(
  overrides: Partial<CreatorInvoice> = {},
  renderAction?: (action: CreatorInvoiceAction) => React.ReactNode,
) {
  const onOpenContent = vi.fn();
  render(
    <CreatorInvoiceView
      invoice={aCreatorInvoice(overrides)}
      onOpenContent={onOpenContent}
      renderAction={renderAction}
    />,
  );
  return { onOpenContent };
}

/** The row of one part of the invoice: its button when it opens, its plain row otherwise. */
function part(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

describe("CreatorInvoiceView", () => {
  describe("the summary", () => {
    it("names the creator and the contract period it settles", () => {
      renderView();

      const summary = screen.getByRole("group", { name: "Ringkasan invoice" });
      expect(summary).toHaveTextContent("Rangga Pratama");
      expect(summary).toHaveTextContent("Periode 1 · 1 Sep – 30 Nov 2026");
    });

    it("calls a running total an estimate and warns it can still change", () => {
      renderView();

      const summary = screen.getByRole("group", { name: "Ringkasan invoice" });
      expect(summary).toHaveTextContent("Estimasi Pendapatan");
      expect(summary).toHaveTextContent("Rp550.000");
      expect(within(summary).getByRole("tooltip")).toHaveTextContent(
        "Bisa berubah sampai kamu acknowledge invoice.",
      );
    });

    it("calls a paid total what was paid, with no warning", () => {
      renderView({ status: "paid" });

      const summary = screen.getByRole("group", { name: "Ringkasan invoice" });
      expect(summary).toHaveTextContent("Total Dibayarkan");
      expect(within(summary).queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("shows the invoice's progress", () => {
      renderView({ status: "finalized", reachedAt: { ...NONE_REACHED, finalized: "2026-12-01T02:00:00Z" } });

      const tracker = screen.getByRole("list", { name: "Progres invoice" });
      expect(within(tracker).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
    });
  });

  describe("the parts", () => {
    it("shows each part with its amount, the way the admin's table writes it", () => {
      renderView();

      expect(part("Fixed Rate Kontrak")).toHaveTextContent("Rp500.000");
      expect(part("Fee Konten Tambahan")).toHaveTextContent("Rp200.000");
      expect(part("Bonus Performa")).toHaveTextContent("Menunggu data");
      expect(part("Penalti")).toHaveTextContent("− Rp150.000");
    });

    it("keeps a part's lines folded until it is opened", () => {
      renderView();

      const toggle = within(part("Fee Konten Tambahan")).getByRole("button", { name: /Fee Konten Tambahan/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Promo akhir bulan")).not.toBeInTheDocument();

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(within(part("Fee Konten Tambahan")).getByRole("list")).toHaveTextContent("Promo akhir bulan");
    });

    it("folds a part again when it is pressed a second time", () => {
      renderView();
      const toggle = within(part("Penalti")).getByRole("button", { name: /Penalti/ });

      fireEvent.click(toggle);
      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Cara lacak paket")).not.toBeInTheDocument();
    });

    it("opens a content's detail from its name", () => {
      const { onOpenContent } = renderView();
      fireEvent.click(within(part("Penalti")).getByRole("button", { name: /Penalti/ }));

      fireEvent.click(screen.getByRole("button", { name: "Cara lacak paket" }));

      expect(onOpenContent).toHaveBeenCalledWith("a1a1a1a1-0000-4000-8000-000000000004");
    });

    it("shows a part with nothing in it as a dash, with nothing to open", () => {
      const base = aCreatorInvoice();
      renderView({ extraAmount: 0, breakdown: { ...base.breakdown, extra: { lines: [], total: 0 } } });

      expect(part("Fee Konten Tambahan")).toHaveTextContent("–");
      expect(within(part("Fee Konten Tambahan")).queryByRole("button")).not.toBeInTheDocument();
    });

    it("still opens the bonus with nothing earned yet, so the creator can read the tiers", () => {
      renderView();

      fireEvent.click(within(part("Bonus Performa")).getByRole("button", { name: /Bonus Performa/ }));

      expect(screen.getByRole("group", { name: "Aturan bonus" })).toHaveTextContent(
        "Instagram (Views) — Tier 1: ≥10.000 → Rp50.000",
      );
    });

    it("says a contract that has not started has not, beside its fixed rate", () => {
      renderView({ notStarted: true });

      expect(part("Fixed Rate Kontrak")).toHaveTextContent("belum dimulai");
    });

    it("shows no adjustment as a dash", () => {
      renderView();

      expect(part("Penyesuaian")).toHaveTextContent("–");
      expect(within(part("Penyesuaian")).queryByRole("button")).not.toBeInTheDocument();
    });

    it("adds the adjustments up and lists each with its reason and date when opened", () => {
      renderView({
        adjustments: [
          { id: "a-1", amount: 100000, reason: "Bonus kampanye", createdAt: "2026-10-01T03:00:00Z" },
          { id: "a-2", amount: -25000, reason: "Koreksi fee", createdAt: "2026-10-02T03:00:00Z" },
        ],
      });

      expect(part("Penyesuaian")).toHaveTextContent("+Rp75.000");

      fireEvent.click(within(part("Penyesuaian")).getByRole("button", { name: /Penyesuaian/ }));

      const lines = within(part("Penyesuaian")).getAllByRole("listitem");
      expect(lines[0]).toHaveTextContent("Bonus kampanye");
      expect(lines[1]).toHaveTextContent("Koreksi fee");
    });
  });

  describe("the total", () => {
    it("closes the parts with the total under the same name as the summary", () => {
      renderView({ status: "finalized" });

      const total = screen.getByRole("group", { name: "Total invoice" });
      expect(total).toHaveTextContent("Total Final");
      expect(total).toHaveTextContent("Rp550.000");
    });

    it("says a total the penalty used up is held at Rp0", () => {
      renderView({ totalAmount: 0, floored: true });

      const total = screen.getByRole("group", { name: "Total invoice" });
      expect(total).toHaveTextContent("Rp0");
      expect(total).toHaveTextContent("Penalti melebihi pendapatan, total minimal Rp0.");
    });

    it("says a bonus still waiting for data is not in the total yet", () => {
      renderView();

      expect(screen.getByRole("group", { name: "Total invoice" })).toHaveTextContent(
        "Belum termasuk bonus performa yang menunggu data.",
      );
    });

    it("says nothing about the bonus once it is measured", () => {
      renderView({ bonusAmount: 50000 });

      expect(screen.getByRole("group", { name: "Total invoice" })).not.toHaveTextContent("menunggu data");
    });
  });

  describe("the payment proof", () => {
    it("links the proof of a paid invoice, opening apart from the page", () => {
      renderView({ status: "paid", proof: PROOF });

      const row = screen.getByRole("group", { name: "Bukti Bayar" });
      expect(row).toHaveTextContent("Diupload 5 Sep 2026");
      const link = within(row).getByRole("link", { name: "Lihat Bukti" });
      expect(link).toHaveAttribute("href", PROOF.url);
      expect(link).toHaveAttribute("target", "_blank");
      // The opened file can neither reach back into this page nor learn where it came from.
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("names a proof whose link was not safe to follow, without linking it", () => {
      renderView({ status: "paid", proof: { ...PROOF, url: null } });

      const row = screen.getByRole("group", { name: "Bukti Bayar" });
      expect(row).toHaveTextContent("transfer-rangga-agustus.pdf");
      expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    });

    it("writes a dash for an upload moment it cannot read", () => {
      renderView({ status: "paid", proof: { ...PROOF, uploadedAt: "not-a-date" } });

      expect(screen.getByRole("group", { name: "Bukti Bayar" })).toHaveTextContent("Diupload –");
    });

    it("has no proof row before the admin uploads one", () => {
      renderView({ status: "creator_acked" });

      expect(screen.queryByRole("group", { name: "Bukti Bayar" })).not.toBeInTheDocument();
    });
  });

  describe("the creator's turn", () => {
    const action = (name: CreatorInvoiceAction) => <button type="button">{`aksi ${name}`}</button>;

    it("asks for an acknowledgement of a finalized invoice, with its button beside the ask", () => {
      renderView({ status: "finalized" }, action);

      const turn = screen.getByRole("region", { name: "Giliran kamu" });
      expect(turn).toHaveTextContent("Cek rincian, lalu acknowledge.");
      expect(within(turn).getByRole("button", { name: "aksi acknowledge" })).toBeInTheDocument();
    });

    it("asks for a confirmation once the proof is in, linking the proof right there", () => {
      renderView({ status: "payment_uploaded", proof: PROOF }, action);

      const turn = screen.getByRole("region", { name: "Giliran kamu" });
      expect(turn).toHaveTextContent("Admin sudah mengirim bukti bayar.");
      expect(within(turn).getByRole("link", { name: "Lihat Bukti" })).toHaveAttribute("href", PROOF.url);
      expect(within(turn).getByRole("button", { name: "aksi confirm" })).toBeInTheDocument();
      // The proof is linked once, where the creator is asked about it.
      expect(screen.getAllByRole("link", { name: "Lihat Bukti" })).toHaveLength(1);
    });

    it("offers no move while it is the admin's turn, only says whose it is", () => {
      renderView({ status: "creator_acked" }, action);

      expect(screen.queryByRole("region", { name: "Giliran kamu" })).not.toBeInTheDocument();
      expect(screen.getByText("Menunggu bukti bayar dari Admin.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^aksi/ })).not.toBeInTheDocument();
    });

    it("offers no move on a running invoice", () => {
      renderView({}, action);

      expect(screen.queryByRole("button", { name: /^aksi/ })).not.toBeInTheDocument();
    });

    it("still says what is asked when no move is wired in", () => {
      renderView({ status: "finalized" });

      expect(screen.getByRole("region", { name: "Giliran kamu" })).toHaveTextContent(
        "Cek rincian, lalu acknowledge.",
      );
    });
  });
});
