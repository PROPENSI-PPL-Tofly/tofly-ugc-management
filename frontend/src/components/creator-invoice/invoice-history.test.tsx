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
