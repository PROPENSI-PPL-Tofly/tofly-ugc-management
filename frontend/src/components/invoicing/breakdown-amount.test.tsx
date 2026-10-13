import { fireEvent, render, screen } from "@testing-library/react";
import type { InvoiceBreakdown } from "@/lib/invoice-breakdown";
import { BreakdownAmount } from "./breakdown-amount";

const BREAKDOWN: InvoiceBreakdown = {
  creatorName: "Rangga Pratama",
  fixed: { lines: [], total: 1000000 },
  extra: { lines: [], total: 0 },
  bonus: { lines: [], total: 100000, performance: "ready" },
  penalty: { lines: [], total: 150000 },
};

function renderAmount(
  kind: Parameters<typeof BreakdownAmount>[0]["kind"],
  breakdown: InvoiceBreakdown = BREAKDOWN,
) {
  const onOpen = vi.fn();
  const onRowClick = vi.fn();
  render(
    // Stands in for the table row, which is pressable too in the prototype: the amount must
    // not press it.
    <div role="presentation" onClick={onRowClick}>
      <BreakdownAmount kind={kind} breakdown={breakdown} onOpen={onOpen} />
    </div>,
  );
  return { onOpen, onRowClick };
}

describe("BreakdownAmount", () => {
  it("shows the column's amount as a button that opens its breakdown", () => {
    const { onOpen } = renderAmount("fixed");

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Rp1.000.000");

    fireEvent.click(button);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("fixed", BREAKDOWN);
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

  it("writes a penalty as money taken away, in red", () => {
    renderAmount("penalty");

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("−Rp150.000");
    expect(button).toHaveClass("text-red-ink");
  });

  it("leaves an amount that is not a penalty out of the red", () => {
    renderAmount("fixed");

    expect(screen.getByRole("button")).not.toHaveClass("text-red-ink");
  });

  it.each(["fixed", "extra", "penalty"] as const)(
    "shows a dash with nothing to press when %s is zero",
    (kind) => {
      renderAmount(kind, {
        ...BREAKDOWN,
        fixed: { lines: [], total: 0 },
        penalty: { lines: [], total: 0 },
      });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByText("—")).toBeInTheDocument();
    },
  );

  describe("a bonus still waiting for performance data", () => {
    const waiting = (total: number): InvoiceBreakdown => ({
      ...BREAKDOWN,
      bonus: { lines: [], total, performance: "waiting" },
    });

    it("reads Menunggu data rather than a zero or a dash, and still opens its breakdown", () => {
      const breakdown = waiting(0);
      const { onOpen } = renderAmount("bonus", breakdown);

      const button = screen.getByRole("button");
      expect(button).toHaveTextContent("Menunggu data");
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      expect(screen.queryByText("Rp0")).not.toBeInTheDocument();

      fireEvent.click(button);
      expect(onOpen).toHaveBeenCalledWith("bonus", breakdown);
    });

    it("shows the bonus already known when there is one", () => {
      renderAmount("bonus", waiting(100000));

      expect(screen.getByRole("button")).toHaveTextContent("Rp100.000");
    });
  });

  it("shows a dash for a bonus of zero once the performance data is in", () => {
    renderAmount("bonus", { ...BREAKDOWN, bonus: { lines: [], total: 0, performance: "ready" } });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
