import { fireEvent, render, screen } from "@testing-library/react";
import { TabChoice, tabChoiceOptions } from "./tab-choice";
import type { StatusTabDef } from "./status-tabs";

const TABS: readonly StatusTabDef<"all" | "action" | "done">[] = [
  { key: "all", label: "Semua", urgent: false, counter: false },
  { key: "action", label: "Perlu Dikerjakan", urgent: true, counter: true },
  { key: "done", label: "Selesai", urgent: false, counter: false },
];
const COUNTS = { all: 5, action: 3, done: 0 };

describe("tabChoiceOptions", () => {
  // Adapter: a status tab list and its counts read as the options of one filter choice, each
  // tab named with its count, zero included, so a phone sees every tab's size at once.
  it("names each tab with its count, in the tabs' order", () => {
    expect(tabChoiceOptions(TABS, COUNTS)).toEqual([
      { value: "all", label: "Semua (5)" },
      { value: "action", label: "Perlu Dikerjakan (3)" },
      { value: "done", label: "Selesai (0)" },
    ]);
  });
});

describe("TabChoice", () => {
  it("offers the tabs as one Tampilkan choice, on the open tab", () => {
    render(<TabChoice tabs={TABS} counts={COUNTS} active="action" onSelect={vi.fn()} />);

    const choice = screen.getByRole("combobox", { name: "Tampilkan" });
    expect(choice).toHaveValue("action");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Semua (5)",
      "Perlu Dikerjakan (3)",
      "Selesai (0)",
    ]);
  });

  it("hands back the tab picked, once", () => {
    const onSelect = vi.fn();
    render(<TabChoice tabs={TABS} counts={COUNTS} active="all" onSelect={onSelect} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Tampilkan" }), { target: { value: "done" } });

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("done");
  });

  it("marks a tab other than Semua as a filter in use", () => {
    render(<TabChoice tabs={TABS} counts={COUNTS} active="done" onSelect={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Tampilkan" })).toHaveAttribute("data-active", "true");
  });

  // From sm up the tabs stay a row above the list; the choice is for a phone's folded bar.
  it("is there on a phone only", () => {
    const { container } = render(<TabChoice tabs={TABS} counts={COUNTS} active="all" onSelect={vi.fn()} />);

    expect(container.firstElementChild).toHaveClass("contents", "sm:hidden");
  });
});
