import { fireEvent, render, screen, within } from "@testing-library/react";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import type { BreakdownStatus } from "./breakdown-popup";
import { BreakdownPopup } from "./breakdown-popup";

const BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: {
    period: { number: 2, start: "2026-09-01", end: "2026-11-30", quotaDone: 7, quotaTotal: 12 },
    total: 5000000,
    notStarted: false,
  },
  extra: {
    lines: [
      { contentId: "c-1", name: "Promo Gajian", rate: 500000, amount: 500000 },
      { contentId: "c-2", name: "Promo 10.10", rate: 500000, amount: 500000 },
    ],
    total: 1000000,
  },
  bonus: {
    lines: [{ kind: "specific", contentId: null, name: "Konten lama", amount: 100000 }],
    total: 100000,
    performance: "waiting",
    rules: {
      tiers: [{ platform: "instagram", metric: "views", steps: [{ min: 10000, bonus: 50000 }] }],
      specificBonus: 100000,
    },
  },
  penalty: {
    lines: [
      {
        contentId: "c-3",
        name: "Evg_3_Rangga_15102026",
        daysLate: 5,
        chargedDays: 3,
        ratePerDay: 50000,
        amount: 150000,
        ongoing: true,
      },
    ],
    total: 150000,
  },
};

type Kind = Parameters<typeof BreakdownPopup>[0]["kind"];

function renderPopup(
  kind: Kind = "extra",
  {
    breakdown = BREAKDOWN,
    status = breakdown ? "ready" : "loading",
  }: { breakdown?: InvoiceBreakdown | null; status?: BreakdownStatus } = {},
) {
  const onClose = vi.fn();
  const onOpenContent = vi.fn();
  const onRetry = vi.fn();
  render(
    <BreakdownPopup
      kind={kind}
      creatorName="Rangga Pratama"
      breakdown={breakdown}
      status={status}
      onRetry={onRetry}
      onClose={onClose}
      onOpenContent={onOpenContent}
    />,
  );
  return { onClose, onOpenContent, onRetry, dialog: screen.getByRole("dialog") };
}

describe("BreakdownPopup", () => {
  it.each([
    ["fixed", "Fixed Rate Kontrak · Rangga Pratama"],
    ["extra", "Fee Konten Tambahan · Rangga Pratama"],
    ["bonus", "Bonus Performa · Rangga Pratama"],
    ["penalty", "Penalti · Rangga Pratama"],
  ] as const)("titles the %s popup as the prototype does, with the creator", (kind, title) => {
    const { dialog } = renderPopup(kind);

    expect(dialog).toHaveAccessibleName(title);
  });

  it("lists each content with how its amount came about", () => {
    const { dialog } = renderPopup("extra");
    const items = within(dialog).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Promo Gajian");
    expect(items[0]).toHaveTextContent("1 konten × Rp500.000");
    expect(items[0]).toHaveTextContent("Rp500.000");
  });

  it("totals the column under its lines", () => {
    renderPopup("extra");

    const total = screen.getByText("Total").closest("div") as HTMLElement;
    expect(total).toHaveTextContent("Rp1.000.000");
  });

  it("opens the Content Detail of the content whose name is pressed", () => {
    const { onOpenContent } = renderPopup("extra");

    fireEvent.click(screen.getByRole("button", { name: "Promo 10.10" }));

    expect(onOpenContent).toHaveBeenCalledTimes(1);
    expect(onOpenContent).toHaveBeenCalledWith("c-2");
  });

  it("says that a name opens the content's detail", () => {
    renderPopup("extra");

    expect(screen.getByRole("button", { name: "Promo Gajian" })).toHaveAttribute(
      "title",
      "Buka detail konten",
    );
  });

  describe("the fixed rate", () => {
    it("is one line for the contract period, with its dates and how much of the quota is done", () => {
      const { dialog } = renderPopup("fixed");
      const items = within(dialog).getAllByRole("listitem");

      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent("Kontrak Periode 2");
      expect(items[0]).toHaveTextContent("1 Sep 2026 – 30 Nov 2026 · Kuota selesai 7/12");
      expect(items[0]).toHaveTextContent("Rp5.000.000");
    });

    it("names the period as plain text, since a period is not a content to open", () => {
      renderPopup("fixed");

      expect(screen.getByText("Kontrak Periode 2")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Kontrak Periode 2" })).not.toBeInTheDocument();
    });

    it("says the contract has not started yet, with no line and no total", () => {
      const { dialog } = renderPopup("fixed", {
        breakdown: { ...BREAKDOWN, fixed: { ...BREAKDOWN.fixed, total: 0, notStarted: true } },
      });

      expect(dialog).toHaveTextContent("Kontrak belum dimulai.");
      expect(within(dialog).queryByRole("list")).not.toBeInTheDocument();
      expect(screen.queryByText("Total")).not.toBeInTheDocument();
    });
  });

  describe("the bonus", () => {
    it("shows the tier info above its lines", () => {
      const { dialog } = renderPopup("bonus");
      const info = within(dialog).getByRole("group", { name: "Aturan bonus" });

      expect(info).toHaveTextContent("Per konten, dipakai tier tertinggi yang tercapai.");
      expect(info).toHaveTextContent("Instagram (Views) — Tier 1: ≥10.000 → Rp50.000");
      expect(info).toHaveTextContent(
        "Specific — Rp100.000 per konten Specific yang selesai tepat waktu",
      );
    });

    it("keeps the tier info when no content has earned a bonus", () => {
      const { dialog } = renderPopup("bonus", {
        breakdown: { ...BREAKDOWN, bonus: { ...BREAKDOWN.bonus, lines: [], total: 0 } },
      });

      expect(within(dialog).getByRole("group", { name: "Aturan bonus" })).toBeInTheDocument();
      expect(dialog).toHaveTextContent("Belum ada konten yang mendapat bonus.");
    });

    it("says the performance bonus is waiting for data", () => {
      renderPopup("bonus");

      expect(screen.getByRole("note")).toHaveTextContent("Bonus performa: Menunggu data");
    });
  });

  it("shows no tier info outside the bonus", () => {
    renderPopup("extra");

    expect(screen.queryByRole("group", { name: "Aturan bonus" })).not.toBeInTheDocument();
  });

  it("shows a line with no content behind it as plain text, with nothing to press", () => {
    renderPopup("bonus");

    expect(screen.getByText("Konten lama")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Konten lama" })).not.toBeInTheDocument();
  });

  it("has no note on a column that is waiting for nothing", () => {
    renderPopup("extra");

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("draws a penalty and its total as money taken away", () => {
    const { dialog } = renderPopup("penalty");
    const [item] = within(dialog).getAllByRole("listitem");

    expect(item).toHaveTextContent("Telat 5 hari · dihitung 3 hari × Rp50.000 · berjalan");
    expect(within(item).getByText("− Rp150.000")).toHaveClass("text-red-ink");
    expect(screen.getByText("Total").closest("div")).toHaveTextContent("− Rp150.000");
  });

  it("leaves an amount that is not a penalty in the ink colour", () => {
    const { dialog } = renderPopup("extra");
    const [item] = within(dialog).getAllByRole("listitem");

    expect(within(item).getByText("Rp500.000")).not.toHaveClass("text-red-ink");
  });

  it("says why an empty column has nothing to list, with no list and no total", () => {
    const { dialog } = renderPopup("extra", {
      breakdown: { ...BREAKDOWN, extra: { lines: [], total: 0 } },
    });

    expect(dialog).toHaveTextContent("Belum ada konten tambahan yang selesai.");
    expect(within(dialog).queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("closes from the Tutup button in its foot", () => {
    const { onClose, dialog } = renderPopup();
    const buttons = within(dialog).getAllByRole("button", { name: "Tutup" });

    fireEvent.click(buttons[buttons.length - 1]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = renderPopup();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a content's name as text, never as markup", () => {
    renderPopup("extra", {
      breakdown: {
        ...BREAKDOWN,
        extra: {
          lines: [{ contentId: "c-x", name: "<img src=x onerror=alert(1)>", rate: 1, amount: 1 }],
          total: 1,
        },
      },
    });

    expect(screen.getByRole("button", { name: "<img src=x onerror=alert(1)>" })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  describe("while the breakdown is on its way", () => {
    it("is already titled with the column and the creator", () => {
      const { dialog } = renderPopup("penalty", { breakdown: null });

      expect(dialog).toHaveAccessibleName("Penalti · Rangga Pratama");
    });

    it("says it is loading, to a screen reader as well, and lists nothing yet", () => {
      const { dialog } = renderPopup("fixed", { breakdown: null });

      expect(within(dialog).getByRole("status")).toHaveTextContent("Memuat rincian…");
      expect(within(dialog).queryByRole("list")).not.toBeInTheDocument();
      expect(screen.queryByText("Total")).not.toBeInTheDocument();
    });
  });

  describe("when the breakdown could not be loaded", () => {
    it("says so, rather than an empty column that would claim there is nothing", () => {
      const { dialog } = renderPopup("fixed", { breakdown: null, status: "failed" });

      expect(within(dialog).getByRole("alert")).toHaveTextContent("Rincian tidak bisa dimuat.");
      expect(dialog).not.toHaveTextContent("Fixed rate kontrak belum diisi.");
      expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    });

    it("offers to try again", () => {
      const { onRetry } = renderPopup("fixed", { breakdown: null, status: "failed" });

      fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("titles the failure with the column and the creator too", () => {
      const { dialog } = renderPopup("bonus", { breakdown: null, status: "failed" });

      expect(dialog).toHaveAccessibleName("Bonus Performa · Rangga Pratama");
    });
  });

  describe("when there is no breakdown to show", () => {
    it("says so plainly, without an error or a retry that could never succeed", () => {
      const { dialog } = renderPopup("fixed", { breakdown: null, status: "missing" });

      expect(dialog).toHaveTextContent("Tidak ada rincian untuk creator ini.");
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Coba lagi" })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
