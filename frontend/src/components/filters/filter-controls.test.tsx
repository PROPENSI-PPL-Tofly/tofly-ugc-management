import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  FilterBar,
  FilterRadio,
  FilterSelect,
  OVERDUE_OPTIONS,
  PeriodFilter,
  ResetFilters,
  SearchBox,
  offeredPicks,
} from "./filter-controls";
import { expectPhoneTarget } from "@/test/touch-target";

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

  // Measured at 375px: a full-width box pushed the Filter press onto a row of its own. The
  // approved design keeps them side by side, the box taking whatever the press leaves.
  it("shares the phone row with the Filter press, taking the room left", () => {
    render(<SearchBox label="Cari" value="" onChange={vi.fn()} />);

    const box = screen.getByRole("searchbox", { name: "Cari" });
    expect(box).toHaveClass("max-sm:min-w-0", "max-sm:flex-1");
    expect(box).not.toHaveClass("max-sm:w-full");
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

// The approved design marks a filter in use where it is chosen: the select stands out and, on a
// phone, its name carries an "Aktif" tag, so the folded bar needs no chips to say what is on.
describe("FilterSelect", () => {
  // Inside the open phone card each name sits over its own full-width select, as approved; a
  // name beside the select wrapped and left the selects ragged.
  it("stacks its name over the select on a phone, side by side from sm up", () => {
    render(<FilterSelect label="Overdue" value="all" options={OVERDUE_OPTIONS} onChange={vi.fn()} />);

    const label = screen.getByRole("combobox", { name: "Overdue" }).closest("label");
    expect(label).toHaveClass("max-sm:flex-col", "max-sm:items-stretch", "items-center");
  });

  it("marks a choice other than the first as active, and says so on a phone", () => {
    render(<FilterSelect label="Overdue" value="yes" options={OVERDUE_OPTIONS} onChange={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "Overdue" });
    expect(select).toHaveAttribute("data-active", "true");
    const tag = screen.getByText("Aktif");
    expect(tag).toHaveClass("sm:hidden");
    expect(select).toHaveAccessibleName("Overdue");
  });

  it("leaves the first choice plain", () => {
    render(<FilterSelect label="Overdue" value="all" options={OVERDUE_OPTIONS} onChange={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Overdue" })).not.toHaveAttribute("data-active");
    expect(screen.queryByText("Aktif")).not.toBeInTheDocument();
  });
});

describe("PeriodFilter", () => {
  let onClear = vi.fn();
  let onPeriod = vi.fn();
  const renderPeriod = (period: string, ignored = false, from = "", to = "") => {
    const onChange = vi.fn();
    onClear = vi.fn();
    onPeriod = vi.fn();
    render(
      <PeriodFilter
        period={period}
        from={from}
        to={to}
        ignored={ignored}
        onPeriod={onPeriod}
        onChange={onChange}
        onClear={onClear}
      />,
    );
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
    // The period goes back on its own, for the bar to apply with its days in one change.
    expect(onPeriod).toHaveBeenCalledExactlyOnceWith("custom");
    expect(onChange).not.toHaveBeenCalled();
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

      // One change for both days, not one per day.
      expect(onClear).toHaveBeenCalledOnce();
      expect(onChange).not.toHaveBeenCalled();
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

  // The approved design opens the fold as one card across the bar, its controls in a column;
  // from sm up the controls stay in the bar's own row.
  it("opens on a phone as one card across the bar, its controls in a column", () => {
    const { toggle, panel } = renderBar();

    expect(panel).not.toHaveClass("max-sm:flex");
    fireEvent.click(toggle);

    expect(panel).toHaveClass("max-sm:flex", "max-sm:basis-full", "max-sm:flex-col", "sm:contents");
  });

  it("keeps the search and Reset outside the fold", () => {
    const { panel } = renderBar();

    expect(panel).not.toContainElement(screen.getByRole("searchbox", { name: "Cari" }));
    expect(panel).not.toContainElement(screen.getByRole("button", { name: "Reset" }));
  });

  // The approved design drops the row of chips under a folded bar: the Filter button counts
  // what is active, and the open controls show each choice themselves (marked Aktif).
  it("counts what is active on the Filter button and draws no chip row, folded or open", () => {
    const { toggle } = renderBar();

    expect(toggle).toHaveAccessibleName("Filter, 2 aktif");
    expect(screen.queryByRole("list", { name: "Filter aktif" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole("list", { name: "Filter aktif" })).not.toBeInTheDocument();
  });

  it("shows the Filter button pressed while the controls are open", () => {
    const { toggle } = renderBar();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveClass("aria-expanded:bg-accent-wash");
  });

  it("says nothing is active when nothing is", () => {
    const { toggle } = renderBar([]);

    expect(toggle).toHaveAccessibleName("Filter");
    expect(screen.queryByRole("list", { name: "Filter aktif" })).not.toBeInTheDocument();
  });
});

// Measured by hit-testing at 375px (Task Saya, Content Plan, Rate & Invoicing): the search box and
// the selects were 32-34px tall, the Filter button 32px, a Tipe choice 28px, a chip 20px and Reset
// 24px. On a phone each is the press that narrows or widens the list, so each gets 44px.
describe("on a phone, every filter control is a 44px press", () => {
  it("covers the search, a select, a range day and Reset", () => {
    const { rerender } = render(<SearchBox label="Cari" value="" onChange={vi.fn()} />);
    expectPhoneTarget(screen.getByRole("searchbox", { name: "Cari" }));

    rerender(<FilterSelect label="Overdue" value="all" options={OVERDUE_OPTIONS} onChange={vi.fn()} />);
    expectPhoneTarget(screen.getByRole("combobox", { name: "Overdue" }));

    rerender(<ResetFilters onReset={vi.fn()} disabled={false} />);
    expectPhoneTarget(screen.getByRole("button", { name: "Reset" }));
  });

  it("covers both days of a custom range", () => {
    render(
      <PeriodFilter
        period="custom"
        from=""
        to=""
        ignored={false}
        onPeriod={vi.fn()}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const days = document.querySelectorAll('input[type="date"]');
    expect(days).toHaveLength(2);
    for (const day of days) expectPhoneTarget(day);
  });

  it("covers each Tipe choice, where the label is what a finger presses", () => {
    render(
      <FilterRadio
        label="Tipe"
        value="all"
        options={[
          { value: "all", label: "Semua" },
          { value: "evergreen", label: "Evergreen" },
        ]}
        onChange={vi.fn()}
      />,
    );

    for (const radio of screen.getAllByRole("radio")) expectPhoneTarget(radio.closest("label"));
  });

  it("covers the Filter button", () => {
    render(
      <FilterBar
        search={null}
        active={[{ id: "overdue", text: "Overdue", onRemove: vi.fn() }]}
        reset={null}
      >
        {null}
      </FilterBar>,
    );

    expectPhoneTarget(screen.getByRole("button", { name: /^Filter/ }));
  });
});
