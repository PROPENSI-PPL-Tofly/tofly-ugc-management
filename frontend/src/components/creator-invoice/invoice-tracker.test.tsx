import { render, screen, within } from "@testing-library/react";
import type { InvoiceStep } from "@/lib/creator-invoice";
import { InvoiceTracker } from "./invoice-tracker";

// Acknowledged: three steps reached, Bukti Bayar awaited.
const STEPS: InvoiceStep[] = [
  { status: "accruing", label: "Berjalan", state: "done", caption: "1 Sep 2026" },
  { status: "finalized", label: "Final", state: "done", caption: "1 Des 2026" },
  { status: "creator_acked", label: "Di-ack Creator", state: "done", caption: "2 Des 2026" },
  { status: "payment_uploaded", label: "Bukti Bayar", state: "current", caption: null },
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
    expect(items[3]).toHaveAttribute("aria-current", "step");
    expect(items.filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("says a step is done in words, not only in colour", () => {
    render(<InvoiceTracker steps={STEPS} />);

    const [first, , , current, next] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("selesai");
    expect(current).not.toHaveTextContent("selesai");
    expect(next).not.toHaveTextContent("selesai");
  });

  it("draws every reached step green and leaves the line into the awaited step grey", () => {
    render(<InvoiceTracker steps={STEPS} />);

    const [, , reached, awaited] = screen.getAllByRole("listitem");
    const dot = (item: HTMLElement) => item.querySelector('[aria-hidden="true"]:last-child');
    const line = (item: HTMLElement) => item.querySelector('[aria-hidden="true"]:not(:last-child)');
    expect(dot(reached)).toHaveClass("bg-green");
    expect(line(reached)).toHaveClass("bg-green");
    expect(dot(awaited)).toHaveClass("bg-surface");
    expect(line(awaited)).toHaveClass("bg-rule");
  });

  it("dates each step reached and leaves the rest undated", () => {
    render(<InvoiceTracker steps={STEPS} />);

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("1 Des 2026");
    expect(items[3]).toHaveTextContent(/^Bukti Bayar$/);
  });
});
