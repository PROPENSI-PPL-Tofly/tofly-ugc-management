import { render, screen, within } from "@testing-library/react";
import type { InvoiceStep } from "@/lib/creator-invoice";
import { InvoiceTracker } from "./invoice-tracker";

const STEPS: InvoiceStep[] = [
  { status: "accruing", label: "Berjalan", state: "done", caption: "1 Sep 2026" },
  { status: "finalized", label: "Final", state: "done", caption: "1 Des 2026" },
  { status: "creator_acked", label: "Di-ack Creator", state: "current", caption: "2 Des 2026" },
  { status: "payment_uploaded", label: "Bukti Bayar", state: "todo", caption: null },
  { status: "paid", label: "Paid", state: "todo", caption: null },
];

describe("InvoiceTracker", () => {
  it("lists the steps in order as the invoice's progress", () => {
    render(<InvoiceTracker steps={STEPS} />);

    const list = screen.getByRole("list", { name: "Progres invoice" });
    expect(within(list).getAllByRole("listitem").map((item) => item.firstChild?.textContent)).toEqual([
      "Berjalan",
      "Final",
      "Di-ack Creator",
      "Bukti Bayar",
      "Paid",
    ]);
  });

  it("marks the current step for a screen reader as well as by sight", () => {
    render(<InvoiceTracker steps={STEPS} />);

    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items.filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("says a step is done in words, not only in colour", () => {
    render(<InvoiceTracker steps={STEPS} />);

    const [first, , current, next] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("selesai");
    expect(current).not.toHaveTextContent("selesai");
    expect(next).not.toHaveTextContent("selesai");
  });

  it("dates each step reached and leaves the rest undated", () => {
    render(<InvoiceTracker steps={STEPS} />);

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("1 Des 2026");
    expect(items[3]).toHaveTextContent(/^Bukti Bayar$/);
  });
});
