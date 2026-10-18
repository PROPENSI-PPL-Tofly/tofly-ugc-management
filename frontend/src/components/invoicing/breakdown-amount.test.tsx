import { fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceRow } from "@/lib/invoice";
import { BreakdownAmount } from "./breakdown-amount";

const ROW: InvoiceRow = {
  creatorId: "creator-rangga",
  creatorName: "Rangga Pratama",
  contractStatus: "active",
  fixedAmount: 1000000,
  extraAmount: 0,
  bonusAmount: 100000,
  penaltyAmount: 150000,
  totalAmount: 0,
  invoiceStatus: "accruing",
};

function renderAmount(
  kind: Parameters<typeof BreakdownAmount>[0]["kind"],
  row: InvoiceRow = ROW,
) {
  const onOpen = vi.fn();
  const onRowClick = vi.fn();
  render(
    // Stands in for the table row, which is pressable too in the prototype: the amount must
    // not press it.
    <div role="presentation" onClick={onRowClick}>
      <BreakdownAmount kind={kind} row={row} onOpen={onOpen} />
    </div>,
  );
  return { onOpen, onRowClick };
}

describe("BreakdownAmount", () => {
  it("shows the column's amount as the table writes it, as a button that opens its breakdown", () => {
    const { onOpen } = renderAmount("fixed");

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Rp1.000.000");

    fireEvent.click(button);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("fixed", ROW);
  });

  it.each([
    ["extra", { extraAmount: 750000 }, "Rp750.000"],
    ["bonus", { bonusAmount: 300000 }, "Rp300.000"],
  ] as const)("reads %s from its own field of the row", (kind, patch, text) => {
    renderAmount(kind, { ...ROW, ...patch });

    expect(screen.getByRole("button")).toHaveTextContent(text);
  });

  it("names the column and the creator for a screen reader, which hears the cell alone", () => {
    renderAmount("fixed");

    expect(screen.getByRole("button")).toHaveAccessibleName(
      "Fixed Rate Rangga Pratama: Rp1.000.000, lihat rincian",
    );
  });

  it("says that the amount can be opened", () => {
    renderAmount("bonus");

    expect(screen.getByRole("button")).toHaveAttribute("title", "Lihat detail");
  });

  it("opens the breakdown without pressing the row the amount sits in", () => {
    const { onOpen, onRowClick } = renderAmount("fixed");

    fireEvent.click(screen.getByRole("button"));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("writes a penalty as money taken away, in red, the way the table does", () => {
    renderAmount("penalty");

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("− Rp150.000");
    expect(button).toHaveClass("text-red-ink");
  });

  it("leaves an amount that is not a penalty out of the red", () => {
    renderAmount("fixed");

    expect(screen.getByRole("button")).not.toHaveClass("text-red-ink");
  });

  it.each([
    ["fixed", { fixedAmount: 0 }],
    ["extra", { extraAmount: 0 }],
    ["bonus", { bonusAmount: 0 }],
    ["penalty", { penaltyAmount: 0 }],
  ] as const)("shows the table's dash with nothing to press when %s is zero", (kind, patch) => {
    renderAmount(kind, { ...ROW, ...patch });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("–")).toHaveClass("text-muted");
  });

  it("reads Menunggu data for a bonus whose data is not in, and still opens it for the reason", () => {
    const row = { ...ROW, bonusAmount: null };
    const { onOpen } = renderAmount("bonus", row);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Menunggu data");
    expect(button).toHaveAccessibleName("Bonus Rangga Pratama: Menunggu data, lihat rincian");
    expect(screen.queryByText("Rp0")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith("bonus", row);
  });

  it("keeps a waiting bonus in the muted tone the table gives it", () => {
    renderAmount("bonus", { ...ROW, bonusAmount: null });

    expect(screen.getByRole("button")).toHaveClass("text-muted");
  });
});
