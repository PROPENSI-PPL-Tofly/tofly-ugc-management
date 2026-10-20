import { fireEvent, render, screen } from "@testing-library/react";
import { InvoiceFilters } from "./invoice-filters";

const hook = vi.hoisted(() => ({
  current: {
    search: "",
    setSearch: vi.fn<(value: string) => void>(),
    param: vi.fn<(key: string) => string>(),
    listParam: vi.fn<(key: string) => string>(),
    setParam: vi.fn<(key: string, value: string) => void>(),
    reset: vi.fn(),
    resetKeeping: vi.fn<(keep: Record<string, string>) => void>(),
    pending: false,
  },
}));

vi.mock("@/lib/use-url-filters", () => ({
  useUrlFilters: () => hook.current,
  SEARCH_DEBOUNCE_MS: 300,
  MAX_SEARCH_LENGTH: 100,
}));

describe("InvoiceFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hook.current.search = "";
    hook.current.pending = false;
    hook.current.param.mockReturnValue("all");
  });

  it("offers the search box the prototype offers", () => {
    render(<InvoiceFilters />);

    expect(screen.getByRole("searchbox", { name: "Cari nama creator" })).toBeInTheDocument();
  });

  it("offers the contract choices in the prototype's words and order", () => {
    render(<InvoiceFilters />);

    const kontrak = screen.getByRole("combobox", { name: "Kontrak" });
    expect(Array.from(kontrak.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Semua",
      "Aktif",
      "Belum Dimulai",
      "Berakhir",
    ]);
  });

  it("offers the invoice pipeline in the prototype's words and order", () => {
    render(<InvoiceFilters />);

    const invoice = screen.getByRole("combobox", { name: "Invoice" });
    expect(Array.from(invoice.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Semua",
      "Berjalan",
      "Invoice Terkirim",
      "Perlu Bukti Bayar",
      "Bukti Bayar Terkirim",
      "Paid",
    ]);
  });

  it("sends a contract pick to the address", () => {
    render(<InvoiceFilters />);

    fireEvent.change(screen.getByRole("combobox", { name: "Kontrak" }), {
      target: { value: "active" },
    });

    expect(hook.current.setParam).toHaveBeenCalledWith("contract", "active");
  });

  it("sends an invoice pick to the address", () => {
    render(<InvoiceFilters />);

    fireEvent.change(screen.getByRole("combobox", { name: "Invoice" }), {
      target: { value: "paid" },
    });

    expect(hook.current.setParam).toHaveBeenCalledWith("status", "paid");
  });

  it("passes typing on to the search box's owner", () => {
    render(<InvoiceFilters />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Cari nama creator" }), {
      target: { value: "salsa" },
    });

    expect(hook.current.setSearch).toHaveBeenCalledWith("salsa");
  });

  // As Creator Database's bar does: no Reset until there is something to reset.
  it("leaves Reset out while there is nothing to reset", () => {
    render(<InvoiceFilters />);

    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("offers Reset once the table is sorted another way, so the sort can be undone", () => {
    hook.current.param.mockImplementation((key) => (key === "sort" ? "total" : "all"));
    render(<InvoiceFilters />);

    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  it("offers Reset once only the order is turned around", () => {
    hook.current.param.mockImplementation((key) => (key === "order" ? "desc" : "all"));
    render(<InvoiceFilters />);

    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  it("offers Reset once a filter is applied", () => {
    hook.current.param.mockImplementation((key) => (key === "contract" ? "active" : "all"));
    render(<InvoiceFilters />);

    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  it("offers Reset while the search box holds something", () => {
    hook.current.search = "salsa";
    render(<InvoiceFilters />);

    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  it("clears the filters in one step", () => {
    hook.current.param.mockReturnValue("active");
    render(<InvoiceFilters />);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(hook.current.reset).toHaveBeenCalled();
  });

  it("holds Reset while a change is still on its way", () => {
    hook.current.param.mockReturnValue("active");
    hook.current.pending = true;
    render(<InvoiceFilters />);

    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });
});
