import { fireEvent, render, screen, within } from "@testing-library/react";
import { aCreatorInvoice } from "@/lib/creator-invoice.builder";
import { InvoiceHistory } from "./invoice-history";

const PAID = aCreatorInvoice({
  periodNumber: 1,
  periodStart: "2026-06-01",
  periodEnd: "2026-08-31",
  status: "paid",
  totalAmount: 1200000,
});

describe("InvoiceHistory", () => {
  it("lists each earlier invoice with its period, status and total", () => {
    render(<InvoiceHistory invoices={[PAID]} onOpen={vi.fn()} />);

    const table = screen.getByRole("table", { name: "Riwayat Invoice" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Periode",
      "Status",
      "Total",
      "Aksi",
    ]);
    const [, row] = within(table).getAllByRole("row");
    expect(row).toHaveTextContent("Periode 1");
    expect(row).toHaveTextContent("1 Jun – 31 Agu 2026");
    expect(row).toHaveTextContent("Paid");
    expect(row).toHaveTextContent("Rp1.200.000");
  });

  // Measured on this table's real markup in Edge at true 320–390 px: the table is 484 px wide,
  // every Rincian sits off-screen, and the page itself widened to 411 px, because the hidden
  // Aksi heading was laid out against the page rather than the table's scroll area. jsdom lays
  // nothing out, so these pin what the fix is built from.
  describe("on a phone, below lg", () => {
    function rowOf(period: string) {
      return screen.getByText(period).closest("tr") as HTMLElement;
    }

    it("keeps the hidden Aksi heading inside the table's own area, so the page never widens", () => {
      render(<InvoiceHistory invoices={[PAID]} onOpen={vi.fn()} />);

      expect(screen.getByText("Aksi").closest(".overflow-x-auto")).toHaveClass("relative");
    });

    it("sets each invoice apart as its own card, with the headers hidden but still read", () => {
      render(
        <InvoiceHistory
          invoices={[PAID, aCreatorInvoice({ contractId: "c-2", periodNumber: 2 })]}
          onOpen={vi.fn()}
        />,
      );

      const table = screen.getByRole("table", { name: "Riwayat Invoice" });
      const [head, body] = within(table).getAllByRole("rowgroup");
      expect(table).toHaveClass("max-lg:block");
      expect(head).toHaveClass("max-lg:sr-only");
      expect(body).toHaveClass("max-lg:flex", "max-lg:flex-col", "max-lg:gap-3");
      expect(rowOf("Periode 1")).toHaveClass("max-lg:rounded-(--radius-panel)", "max-lg:border");
    });

    it("names the status and the total by their columns", () => {
      render(<InvoiceHistory invoices={[PAID]} onOpen={vi.fn()} />);

      const cells = within(rowOf("Periode 1")).getAllByRole("cell");
      expect(cells.map((cell) => cell.dataset.label ?? null)).toEqual([null, "Status", "Total", null]);
    });

    // Seen in the browser check: the desktop right-alignment pushed the "Total" label away from
    // the "Status" label above it.
    it("lines the total up with the status in a card, and keeps it right-aligned in the table", () => {
      render(<InvoiceHistory invoices={[PAID]} onOpen={vi.fn()} />);

      const total = within(rowOf("Periode 1")).getAllByRole("cell")[2];
      expect(total).toHaveClass("text-right", "max-lg:text-left");
    });

    it("gives Rincian a full-width touch target at least 44px tall", () => {
      render(<InvoiceHistory invoices={[PAID]} onOpen={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Rincian invoice Periode 1" })).toHaveClass(
        "max-lg:w-full",
        "max-lg:min-h-11",
      );
    });
  });

  it("opens an invoice's breakdown from its Rincian button", () => {
    const onOpen = vi.fn();
    render(<InvoiceHistory invoices={[PAID]} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Rincian invoice Periode 1" }));

    expect(onOpen).toHaveBeenCalledWith(PAID);
  });

  it("writes a total the penalty used up as Rp0", () => {
    render(<InvoiceHistory invoices={[{ ...PAID, totalAmount: 0, floored: true }]} onOpen={vi.fn()} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Rp0");
  });

  it("says there is no earlier invoice when there is none", () => {
    render(<InvoiceHistory invoices={[]} onOpen={vi.fn()} />);

    expect(screen.getByRole("table", { name: "Riwayat Invoice" })).toHaveTextContent(
      "Belum ada invoice dari periode sebelumnya.",
    );
  });
});
