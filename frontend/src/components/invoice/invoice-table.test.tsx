import { fireEvent, render, screen, within } from "@testing-library/react";
import { InvoiceTable } from "./invoice-table";
import { DASH, TOTAL_FORMULA, type InvoiceRow } from "@/lib/invoice";

const FULL: InvoiceRow = {
  creatorId: "creator-rangga",
  creatorName: "Rangga Pratama",
  contractStatus: "active",
  fixedAmount: 5000000,
  extraAmount: 750000,
  bonusAmount: 300000,
  penaltyAmount: 250000,
  totalAmount: 5800000,
  floored: false,
  invoiceStatus: "accruing",
};

const ZEROS: InvoiceRow = {
  creatorId: "creator-hana",
  creatorName: "Hana Safira",
  contractStatus: "upcoming",
  fixedAmount: 0,
  extraAmount: 0,
  bonusAmount: 0,
  penaltyAmount: 0,
  totalAmount: 0,
  floored: false,
  invoiceStatus: "paid",
};

const WAITING: InvoiceRow = {
  creatorId: "creator-dimas",
  creatorName: "Dimas Aji",
  contractStatus: "expired",
  fixedAmount: 4500000,
  extraAmount: 0,
  bonusAmount: null,
  penaltyAmount: 0,
  totalAmount: 4500000,
  floored: false,
  invoiceStatus: "finalized",
};

describe("InvoiceTable", () => {
  it("heads the columns in the prototype's order and widths", () => {
    const { container } = render(<InvoiceTable rows={[FULL]} />);

    // The ⓘ beside Total carries its own label and tooltip; the heading is the text before it.
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent?.split("ⓘ")[0])).toEqual([
      "Creator",
      "Fixed Rate",
      "Fee Konten Tambahan",
      "Bonus Performa",
      "Penalti",
      "Total",
      "Status Invoice",
    ]);
    const cols = Array.from(container.querySelectorAll("col"));
    expect(cols.map((col) => col.className)).toEqual([
      "w-[20%]",
      "w-[12%]",
      "w-[13%]",
      "w-[13%]",
      "w-[13%]",
      "w-[13%]",
      "w-[16%]",
    ]);
    // Widths come from classes: the CSP refuses inline styles.
    expect(cols.some((col) => col.hasAttribute("style"))).toBe(false);
  });

  it("says under a total held at zero that the penalty outweighed the pay", () => {
    render(<InvoiceTable rows={[{ ...FULL, penaltyAmount: 9000000, totalAmount: 0, floored: true }]} />);

    expect(screen.getByText("Rp0")).toBeInTheDocument();
    expect(screen.getByText("Penalti melebihi pembayaran")).toBeInTheDocument();
  });

  it("adds no remark to a total that was not held", () => {
    render(<InvoiceTable rows={[FULL]} />);

    expect(screen.queryByText("Penalti melebihi pembayaran")).not.toBeInTheDocument();
  });

  it("keeps the table's overflow inside its own scroll region", () => {
    const { container } = render(<InvoiceTable rows={[FULL]} />);

    // An absolutely placed child (a screen-reader label) would otherwise widen the whole page.
    expect(container.firstElementChild).toHaveClass("relative", "overflow-x-auto");
  });

  it("names the creator, and says where their contract stands under it", () => {
    render(<InvoiceTable rows={[FULL]} />);

    expect(screen.getByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Kontrak Aktif")).toBeInTheDocument();
  });

  it("writes every amount the way the prototype writes it", () => {
    render(<InvoiceTable rows={[FULL]} />);

    expect(screen.getByText("Rp5.000.000")).toBeInTheDocument();
    expect(screen.getByText("Rp750.000")).toBeInTheDocument();
    expect(screen.getByText("Rp300.000")).toBeInTheDocument();
    expect(screen.getByText("− Rp250.000")).toBeInTheDocument();
  });

  it("reads the final rate as the strong number at the end of the row", () => {
    render(<InvoiceTable rows={[FULL]} />);

    const final = screen.getByText("Rp5.800.000");
    expect(final.tagName).toBe("STRONG");
  });

  it("shows a penalty as what is taken off, in the danger colour", () => {
    render(<InvoiceTable rows={[FULL]} />);

    expect(screen.getByText("− Rp250.000").className).toContain("text-red-ink");
  });

  it("draws the invoice's state as a pill worded as the prototype words it", () => {
    render(<InvoiceTable rows={[FULL]} />);

    expect(screen.getByText("Berjalan")).toBeInTheDocument();
  });

  it("dashes every amount that is nothing, and never calls it a zero", () => {
    render(<InvoiceTable rows={[ZEROS]} />);

    expect(screen.getByText("Kontrak Belum Dimulai")).toBeInTheDocument();
    // The four amounts and the final rate that comes out to nothing with them.
    expect(screen.getAllByText(DASH)).toHaveLength(5);
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("says the bonus is waiting in its own cell and runs the final rate without it", () => {
    render(<InvoiceTable rows={[WAITING]} />);

    expect(screen.getAllByText("Menunggu data")).toHaveLength(1);
    // The fixed rate, and the final rate the backend worked out without the bonus.
    expect(screen.getAllByText("Rp4.500.000")).toHaveLength(2);
  });

  it("says the filter found nobody rather than showing an empty grid", () => {
    render(<InvoiceTable rows={[]} />);

    expect(screen.getByText("Tidak ada creator sesuai filter.")).toBeInTheDocument();
  });

  describe("with the breakdown triggers of 8.5", () => {
    const trigger = (kind: string, row: InvoiceRow) => (
      <button type="button">{`${kind} of ${row.creatorName}`}</button>
    );

    it("puts the trigger it is handed in each of the four money cells, in their order", () => {
      render(<InvoiceTable rows={[FULL]} amount={trigger} />);

      const body = screen.getAllByRole("rowgroup")[1];
      expect(within(body).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "fixed of Rangga Pratama",
        "extra of Rangga Pratama",
        "bonus of Rangga Pratama",
        "penalty of Rangga Pratama",
      ]);
    });

    it("leaves the final rate and the invoice as they are, as neither opens a breakdown", () => {
      render(<InvoiceTable rows={[FULL]} amount={trigger} />);

      expect(screen.getByText("Rp5.800.000")).toBeInTheDocument();
      expect(screen.getByText("Berjalan")).toBeInTheDocument();
    });
  });

  it("gives every column its own key, so React never warns that two are the same", () => {
    // Several columns share a width, so a width cannot be what tells them apart.
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(<InvoiceTable rows={[FULL]} />);

      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  describe("sorting (when the board hands it an order)", () => {
    const sortProps = (key: "action" | "name" | "fixed" | "penalty" | "total", order: "asc" | "desc" = "desc") => ({
      key,
      order,
      onSort: vi.fn(),
    });

    it("lets Creator, Fixed Rate, Penalti and Total be sorted, the others not", () => {
      render(<InvoiceTable rows={[FULL]} sort={sortProps("action")} />);

      expect(screen.getAllByRole("columnheader").filter((th) => th.querySelector("button[title]")).map((th) => th.querySelector("button[title]")?.textContent)).toEqual([
        "Creator",
        "Fixed Rate",
        "Penalti",
        "Total",
      ]);
    });

    it("marks no column while the table reads what needs action first", () => {
      render(<InvoiceTable rows={[FULL]} sort={sortProps("action")} />);

      expect(screen.getAllByRole("columnheader").filter((th) => th.getAttribute("aria-sort") && th.getAttribute("aria-sort") !== "none")).toEqual([]);
    });

    it("marks the column it is sorted by, in its direction", () => {
      render(<InvoiceTable rows={[FULL]} sort={sortProps("total", "desc")} />);

      expect(screen.getByRole("columnheader", { name: /^Total/ })).toHaveAttribute("aria-sort", "descending");
      expect(screen.getByRole("columnheader", { name: /^Creator/ })).toHaveAttribute("aria-sort", "none");
    });

    it("reports which column was pressed", () => {
      const sort = sortProps("action");
      render(<InvoiceTable rows={[FULL]} sort={sort} />);

      fireEvent.click(screen.getByRole("button", { name: /^Penalti/ }));

      expect(sort.onSort).toHaveBeenCalledWith("penalty");
    });
  });

  it("explains the total behind an ⓘ in its own header, that the bonus waiting is not in it", () => {
    render(<InvoiceTable rows={[FULL]} />);

    expect(screen.getByRole("button", { name: "Info rumus Total" })).toHaveAccessibleDescription(TOTAL_FORMULA);
    expect(TOTAL_FORMULA).toBe(
      "Total = Fixed Rate + Fee Konten Tambahan + Bonus Performa − Penalti. Bonus yang masih menunggu data belum dihitung.",
    );
  });

  it("adds up every creator the filters keep under the table, across pages", () => {
    render(<InvoiceTable rows={[FULL]} summary={{ total: 12345000, count: 24 }} />);

    const footer = screen.getAllByRole("rowgroup").at(-1)!;
    expect(footer.tagName).toBe("TFOOT");
    expect(within(footer).getByText("Total 24 creator")).toBeInTheDocument();
    expect(within(footer).getByText("Rp12.345.000")).toBeInTheDocument();
  });

  it("adds no footer to an empty table", () => {
    const { container } = render(<InvoiceTable rows={[]} summary={{ total: 0, count: 0 }} />);

    expect(container.querySelector("tfoot")).toBeNull();
  });

  it("gives each row an action column when the board hands one in, named for a screen reader", () => {
    render(<InvoiceTable rows={[FULL]} action={(row) => <button type="button">Rincian {row.creatorName}</button>} />);

    expect(screen.getByRole("columnheader", { name: "Aksi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rincian Rangga Pratama" })).toBeInTheDocument();
  });
});
