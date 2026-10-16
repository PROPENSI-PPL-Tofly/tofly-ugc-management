import { fireEvent, render, screen } from "@testing-library/react";
import {
  FilteredEmpty,
  FilterSelect,
  OVERDUE_OPTIONS,
  PeriodFilter,
  ResetFilters,
  SearchBox,
  offeredPicks,
} from "./filter-controls";

describe("offeredPicks", () => {
  const OPTIONS = [
    { value: "evergreen", label: "Evergreen" },
    { value: "specific", label: "Specific" },
  ];

  it("reads a comma-separated parameter as the picks the control offers, in the order given", () => {
    expect(offeredPicks("specific,evergreen", OPTIONS)).toEqual(["specific", "evergreen"]);
  });

  it("leaves out what the control does not offer, blanks and the not-applied value included", () => {
    expect(offeredPicks("foo, evergreen ,,bogus", OPTIONS)).toEqual(["evergreen"]);
    expect(offeredPicks("all", OPTIONS)).toEqual([]);
    expect(offeredPicks("", OPTIONS)).toEqual([]);
  });
});

describe("SearchBox", () => {
  it("is a labelled search field capped at what the APIs take", () => {
    const onChange = vi.fn();
    render(<SearchBox label="Cari judul konten" value="" onChange={onChange} />);

    const box = screen.getByRole("searchbox", { name: "Cari judul konten" });
    expect(box).toHaveAttribute("maxLength", "100");
    expect(box).toHaveAttribute("placeholder", "Cari judul konten…");

    fireEvent.change(box, { target: { value: "serum" } });
    expect(onChange).toHaveBeenCalledWith("serum");
  });
});

describe("FilterSelect", () => {
  it("labels a native select with visible text and hands back the picked value", () => {
    const onChange = vi.fn();
    render(<FilterSelect label="Overdue" value="all" options={OVERDUE_OPTIONS} onChange={onChange} />);

    const select = screen.getByRole("combobox", { name: "Overdue" });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Semua",
      "Overdue",
      "Tidak overdue",
    ]);

    fireEvent.change(select, { target: { value: "yes" } });
    expect(onChange).toHaveBeenCalledWith("yes");
  });
});

describe("PeriodFilter", () => {
  const renderPeriod = (period: string, ignored = false, from = "", to = "") => {
    const onChange = vi.fn();
    render(<PeriodFilter period={period} from={from} to={to} ignored={ignored} onChange={onChange} />);
    return onChange;
  };

  it("offers the named periods and hides the custom days until they are asked for", () => {
    const onChange = renderPeriod("all");

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Semua periode",
      "Bulan ini",
      "30 hari ke depan",
      "90 hari terakhir",
      "Pilih tanggal…",
    ]);
    expect(screen.queryByLabelText("Dari")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Periode" }), {
      target: { value: "custom" },
    });
    expect(onChange).toHaveBeenCalledWith("period", "custom");
  });

  it("shows Dari and Sampai for a custom period and hands back each day under its key", () => {
    const onChange = renderPeriod("custom", false, "2026-10-01", "");

    expect(screen.getByLabelText("Dari")).toHaveValue("2026-10-01");
    fireEvent.change(screen.getByLabelText("Sampai"), { target: { value: "2026-10-31" } });

    expect(onChange).toHaveBeenCalledWith("to", "2026-10-31");
  });

  it("hands back the start day under from", () => {
    const onChange = renderPeriod("custom");
    fireEvent.change(screen.getByLabelText("Dari"), { target: { value: "2026-10-05" } });
    expect(onChange).toHaveBeenCalledWith("from", "2026-10-05");
  });

  it("says when the open tab ignores the period, in a colour that keeps its contrast on white", () => {
    renderPeriod("month", true);

    const hint = screen.getByText("Periode tidak berlaku di tab ini");
    expect(hint.className).toContain("text-amber-ink");
    expect(hint.className).not.toMatch(/text-amber(\s|$)/);
  });

  // Inline, the note pushed Reset onto a second line of its own; as the bar's last full-width
  // line it leaves every control on the first.
  it("puts the note on its own line after every control", () => {
    renderPeriod("month", true);

    const hint = screen.getByText("Periode tidak berlaku di tab ini");
    expect(hint.className).toContain("basis-full");
    expect(hint.className).toContain("order-last");
  });

  it("stays quiet when the period applies", () => {
    renderPeriod("month", false);
    expect(screen.queryByText("Periode tidak berlaku di tab ini")).not.toBeInTheDocument();
  });
});

describe("FilteredEmpty", () => {
  it("says the filters found nothing, how to widen them, and offers Reset filter", () => {
    const onReset = vi.fn();
    render(<FilteredEmpty title="Tidak ada konten sesuai filter." onReset={onReset} />);

    expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
    expect(screen.getByText("Longgarkan pencarian atau filternya.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("ResetFilters", () => {
  it("clears on press and cannot be pressed while a change is on its way", () => {
    const onReset = vi.fn();
    const { rerender } = render(<ResetFilters onReset={onReset} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);

    rerender(<ResetFilters onReset={onReset} disabled />);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });
});
