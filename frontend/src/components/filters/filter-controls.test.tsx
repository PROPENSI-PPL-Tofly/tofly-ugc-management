import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  FilterBar,
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
    expect(screen.queryByLabelText("Deadline mulai")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Periode" }), {
      target: { value: "custom" },
    });
    expect(onChange).toHaveBeenCalledWith("period", "custom");
  });

  // Client feedback B1: "Dari" and "Sampai" did not say what they range over. They narrow the
  // list by deadline (deadlineFrom / deadlineTo), so they are named for it and grouped as one.
  describe("the custom deadline range", () => {
    function range() {
      return within(screen.getByRole("group", { name: "Rentang deadline" }));
    }

    it("groups the two days under one name and labels each by the deadline it bounds", () => {
      renderPeriod("custom", false, "2026-10-01", "");

      expect(range().getByLabelText("Deadline mulai")).toHaveValue("2026-10-01");
      expect(range().getByLabelText("Deadline sampai")).toHaveValue("");
      expect(screen.queryByLabelText("Dari")).toBeNull();
      expect(screen.queryByLabelText("Sampai")).toBeNull();
    });

    it("hands back each day under its own key", () => {
      const onChange = renderPeriod("custom");

      fireEvent.change(screen.getByLabelText("Deadline mulai"), { target: { value: "2026-10-05" } });
      fireEvent.change(screen.getByLabelText("Deadline sampai"), { target: { value: "2026-10-31" } });

      expect(onChange).toHaveBeenCalledWith("from", "2026-10-05");
      expect(onChange).toHaveBeenCalledWith("to", "2026-10-31");
    });

    it("keeps the date pickers from offering a range that ends before it starts", () => {
      renderPeriod("custom", false, "2026-10-01", "2026-10-31");

      expect(screen.getByLabelText("Deadline mulai")).toHaveAttribute("max", "2026-10-31");
      expect(screen.getByLabelText("Deadline sampai")).toHaveAttribute("min", "2026-10-01");
    });

    it.each([
      ["both days", "2026-10-01", "2026-10-31", "Deadline 1 Okt – 31 Okt 2026"],
      ["only the start", "2026-10-01", "", "Deadline mulai 1 Okt 2026"],
      ["only the end", "", "2026-10-31", "Deadline sampai 31 Okt 2026"],
      ["neither day", "", "", "Pilih salah satu atau kedua tanggal"],
    ])("says which deadlines are shown with %s picked", (_, from, to, summary) => {
      renderPeriod("custom", false, from, to);

      const status = screen.getByRole("status");
      expect(status).toHaveTextContent(summary);
      expect(screen.getByLabelText("Deadline mulai").getAttribute("aria-describedby")).toBe(
        status.id,
      );
    });

    it("says a range typed backwards is read the right way round, as the list reads it", () => {
      renderPeriod("custom", false, "2026-10-31", "2026-10-01");

      expect(screen.getByRole("status")).toHaveTextContent(
        "Deadline mulai jatuh setelah deadline sampai, jadi dibaca 1 Okt – 31 Okt 2026",
      );
    });

    it("clears both days in one press, and offers it only while a day is picked", () => {
      const onChange = renderPeriod("custom", false, "2026-10-01", "2026-10-31");

      fireEvent.click(range().getByRole("button", { name: "Kosongkan tanggal" }));

      expect(onChange).toHaveBeenCalledWith("from", "");
      expect(onChange).toHaveBeenCalledWith("to", "");
    });

    it("offers no clearing while no day is picked", () => {
      renderPeriod("custom");

      expect(screen.queryByRole("button", { name: "Kosongkan tanggal" })).toBeNull();
    });
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

// Measured on a phone (Task Saya, 320px): the search, Tipe, Status, Overdue and Periode each took
// a row of their own, about 230px before the first task. Below sm the controls fold behind one
// Filter button, and what is active stays in sight as chips that each take off one filter.
describe("FilterBar", () => {
  const ACTIVE = [
    { id: "type:evergreen", text: "Tipe: Evergreen", onRemove: vi.fn() },
    { id: "overdue", text: "Overdue", onRemove: vi.fn() },
  ];

  function renderBar(active = ACTIVE) {
    render(
      <FilterBar
        search={<input type="search" aria-label="Cari" />}
        active={active}
        reset={<button type="button">Reset</button>}
      >
        <label>
          Overdue <select aria-label="Overdue" />
        </label>
      </FilterBar>,
    );
    const toggle = screen.getByRole("button", { name: /^Filter/ });
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "") as HTMLElement;
    return { toggle, panel };
  }

  it("folds the controls behind a Filter button on a phone, and leaves the desktop bar as it is", () => {
    const { toggle, panel } = renderBar();

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("sm:hidden");
    expect(panel).toContainElement(screen.getByLabelText("Overdue"));
    expect(panel).toHaveClass("contents", "max-sm:hidden");
  });

  it("opens the controls on a press, and folds them again on the next", () => {
    const { toggle, panel } = renderBar();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveClass("max-sm:hidden");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveClass("max-sm:hidden");
  });

  it("keeps the search and Reset outside the fold", () => {
    const { panel } = renderBar();

    expect(panel).not.toContainElement(screen.getByRole("searchbox", { name: "Cari" }));
    expect(panel).not.toContainElement(screen.getByRole("button", { name: "Reset" }));
  });

  it("counts what is active on the Filter button and names each as a chip while folded", () => {
    const { toggle } = renderBar();

    expect(toggle).toHaveAccessibleName("Filter, 2 aktif");
    const chips = screen.getByRole("list", { name: "Filter aktif" });
    expect(chips).toHaveClass("sm:hidden");
    expect(within(chips).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Tipe: Evergreen×",
      "Overdue×",
    ]);
  });

  it("takes off only the filter whose chip is pressed", () => {
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Hapus Overdue" }));

    expect(ACTIVE[1].onRemove).toHaveBeenCalledOnce();
    expect(ACTIVE[0].onRemove).not.toHaveBeenCalled();
  });

  it("shows the chips only while folded, so an open bar does not say the same thing twice", () => {
    const { toggle } = renderBar();

    fireEvent.click(toggle);

    expect(screen.queryByRole("list", { name: "Filter aktif" })).not.toBeInTheDocument();
  });

  it("says nothing is active when nothing is", () => {
    const { toggle } = renderBar([]);

    expect(toggle).toHaveAccessibleName("Filter");
    expect(screen.queryByRole("list", { name: "Filter aktif" })).not.toBeInTheDocument();
  });
});
