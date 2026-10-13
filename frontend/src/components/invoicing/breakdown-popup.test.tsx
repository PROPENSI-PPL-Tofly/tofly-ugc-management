import { fireEvent, render, screen, within } from "@testing-library/react";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
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

function renderPopup(kind: Parameters<typeof BreakdownPopup>[0]["kind"] = "fixed") {
  const onClose = vi.fn();
  const onOpenContent = vi.fn();
  render(
    <BreakdownPopup
      kind={kind}
      breakdown={BREAKDOWN}
      onClose={onClose}
      onOpenContent={onOpenContent}
    />,
  );
  return { onClose, onOpenContent, dialog: screen.getByRole("dialog") };
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
        breakdown={{
          ...BREAKDOWN,
          extra: {
            lines: [
              { contentId: "c-x", name: "<img src=x onerror=alert(1)>", rate: 1, amount: 1 },
            ],
            total: 1,
          },
        }}
        onClose={vi.fn()}
        onOpenContent={onOpenContent}
      />,
    );

    expect(screen.getByRole("button", { name: "<img src=x onerror=alert(1)>" })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
