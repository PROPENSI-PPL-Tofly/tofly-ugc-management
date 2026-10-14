import { fireEvent, render, screen, within } from "@testing-library/react";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import type { BreakdownStatus } from "./breakdown-popup";
import { BreakdownPopup } from "./breakdown-popup";

const BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: {
    lines: [
      { contentId: "c-1", name: "Evg_1_Rangga_01102026", rate: 500000, amount: 500000 },
      { contentId: "c-2", name: "Evg_2_Rangga_08102026", rate: 500000, amount: 500000 },
    ],
    total: 1000000,
  },
  extra: { lines: [], total: 0 },
  bonus: {
    lines: [{ kind: "specific", contentId: null, name: "Konten lama", amount: 100000 }],
    total: 100000,
    performance: "waiting",
  },
  penalty: {
    lines: [
      {
        contentId: "c-3",
        name: "Evg_3_Rangga_15102026",
        daysLate: 3,
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
  kind: Kind = "fixed",
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
  it("is a dialog titled with the column and the creator", () => {
    const { dialog } = renderPopup("fixed");

    expect(dialog).toHaveAccessibleName("Fixed Rate · Rangga Pratama");
  });

  it("lists each content with how its amount came about", () => {
    const { dialog } = renderPopup("fixed");
    const items = within(dialog).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Evg_1_Rangga_01102026");
    expect(items[0]).toHaveTextContent("1 konten × Rp500.000");
    expect(items[0]).toHaveTextContent("Rp500.000");
  });

  it("totals the column under its lines", () => {
    renderPopup("fixed");

    const total = screen.getByText("Total").closest("div") as HTMLElement;
    expect(total).toHaveTextContent("Rp1.000.000");
  });

  it("opens the Content Detail of the content whose name is pressed", () => {
    const { onOpenContent } = renderPopup("fixed");

    fireEvent.click(screen.getByRole("button", { name: "Evg_2_Rangga_08102026" }));

    expect(onOpenContent).toHaveBeenCalledTimes(1);
    expect(onOpenContent).toHaveBeenCalledWith("c-2");
  });

  it("says that a name opens the content's detail", () => {
    renderPopup("fixed");

    expect(screen.getByRole("button", { name: "Evg_1_Rangga_01102026" })).toHaveAttribute(
      "title",
      "Buka detail konten",
    );
  });

  it("shows a line with no content behind it as plain text, with nothing to press", () => {
    renderPopup("bonus");

    expect(screen.getByText("Konten lama")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Konten lama" })).not.toBeInTheDocument();
  });

  it("says the performance bonus is waiting for data", () => {
    renderPopup("bonus");

    expect(screen.getByRole("note")).toHaveTextContent("Bonus performa: Menunggu data");
  });

  it("has no note on a column that is waiting for nothing", () => {
    renderPopup("fixed");

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("draws a penalty and its total as money taken away", () => {
    const { dialog } = renderPopup("penalty");
    const [item] = within(dialog).getAllByRole("listitem");

    expect(item).toHaveTextContent("Telat 3 hari × Rp50.000 · masih berjalan");
    expect(within(item).getByText("− Rp150.000")).toHaveClass("text-red-ink");
    expect(screen.getByText("Total").closest("div")).toHaveTextContent("− Rp150.000");
  });

  it("leaves an amount that is not a penalty in the ink colour", () => {
    const { dialog } = renderPopup("fixed");
    const [item] = within(dialog).getAllByRole("listitem");

    expect(within(item).getByText("Rp500.000")).not.toHaveClass("text-red-ink");
  });

  it("says why an empty column has nothing to list, with no list and no total", () => {
    const { dialog } = renderPopup("extra");

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
    const onOpenContent = vi.fn();
    render(
      <BreakdownPopup
        kind="extra"
        creatorName="Rangga Pratama"
        breakdown={{
          ...BREAKDOWN,
          extra: {
            lines: [
              { contentId: "c-x", name: "<img src=x onerror=alert(1)>", rate: 1, amount: 1 },
            ],
            total: 1,
          },
        }}
        status="ready"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onOpenContent={onOpenContent}
      />,
    );

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
      expect(dialog).not.toHaveTextContent("Belum ada konten yang selesai.");
      expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    });

    it("offers to try again", () => {
      const { onRetry } = renderPopup("fixed", { breakdown: null, status: "failed" });

      fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("titles the failure with the column and the creator too", () => {
      const { dialog } = renderPopup("bonus", { breakdown: null, status: "failed" });

      expect(dialog).toHaveAccessibleName("Bonus · Rangga Pratama");
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
