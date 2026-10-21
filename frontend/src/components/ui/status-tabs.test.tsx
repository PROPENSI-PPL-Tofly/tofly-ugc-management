import { fireEvent, render, screen } from "@testing-library/react";
import { StatusTabs, type StatusTabDef } from "./status-tabs";
import { SCROLL_HINT } from "./use-scroll-hint";
import { expectPhoneTarget } from "@/test/touch-target";

type Key = "all" | "todo" | "wait" | "done";

const TABS: readonly StatusTabDef<Key>[] = [
  { key: "all", label: "Semua", urgent: false, counter: false },
  { key: "todo", label: "Perlu Dikerjakan", urgent: true, counter: true },
  { key: "wait", label: "Menunggu Admin", urgent: false, counter: true },
  { key: "done", label: "Selesai", urgent: false, counter: false },
];

const COUNTS: Record<Key, number> = { all: 9, todo: 4, wait: 2, done: 3 };

function renderTabs(active: Key = "all", counts = COUNTS) {
  const onSelect = vi.fn();
  render(
    <StatusTabs
      label="Tab Task Saya"
      panelId="task-list"
      tabs={TABS}
      active={active}
      counts={counts}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

const tabs = () => screen.getAllByRole("tab");

describe("StatusTabs", () => {
  // The approved design: on a phone the tabs are one Tampilkan choice inside the folded filters
  // (TabChoice), so the row of tabs steps aside below sm and stays as it is from sm up.
  it("steps aside on a phone, where the tabs are a choice in the filters", () => {
    renderTabs();

    expect(screen.getByRole("tablist", { name: "Tab Task Saya" })).toHaveClass("max-sm:hidden");
  });

  it("names its tab list and offers each tab in order, counting only those that count", () => {
    renderTabs();

    expect(screen.getByRole("tablist", { name: "Tab Task Saya" })).toBeInTheDocument();
    expect(tabs().map((node) => node.textContent)).toEqual([
      "Semua",
      "Perlu Dikerjakan4",
      "Menunggu Admin2",
      "Selesai",
    ]);
  });

  it("marks the tab it is on as selected and points every tab at the list it controls", () => {
    renderTabs("wait");

    expect(tabs().map((node) => node.getAttribute("aria-selected"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    for (const node of tabs()) {
      expect(node).toHaveAttribute("aria-controls", "task-list");
    }
  });

  // Seen in the browser: stacking the selected classes on the plain ones let border-transparent
  // and text-muted win, so the selected tab looked like every other. Each state names its own.
  it("underlines the selected tab in brand blue with no plain-tab class left to override it", () => {
    renderTabs("wait");
    const [plain, , selected] = [tabs()[0], tabs()[1], tabs()[2]];

    expect(selected.className).toContain("border-accent");
    expect(selected.className).toContain("text-accent-deep");
    expect(selected.className).not.toContain("border-transparent");
    expect(selected.className).not.toContain("text-muted");
    expect(plain.className).toContain("border-transparent");
    expect(plain.className).toContain("text-muted");
  });

  it("turns the urgent counter red past zero and hides it at zero", () => {
    renderTabs("all", { ...COUNTS, todo: 4 });
    expect(screen.getByTestId("count-todo").className).toContain("bg-red");
  });

  it("hides the urgent counter at zero, so an empty queue does not cry wolf", () => {
    renderTabs("all", { ...COUNTS, todo: 0 });
    expect(screen.queryByTestId("count-todo")).not.toBeInTheDocument();
  });

  it("keeps a counting tab grey with zero included", () => {
    renderTabs("all", { ...COUNTS, wait: 0 });
    const badge = screen.getByTestId("count-wait");
    expect(badge).toHaveTextContent("0");
    expect(badge.className).toContain("bg-surface-2");
  });

  it("hands the pressed tab back", () => {
    const onSelect = renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Selesai" }));
    expect(onSelect).toHaveBeenCalledWith("done");
  });

  // WAI-ARIA tabs: one Tab stop for the whole list, the arrows move between tabs.
  it("leaves only the selected tab in the Tab order", () => {
    renderTabs("todo");

    expect(tabs().map((node) => node.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it.each([
    ["ArrowRight", "todo", "wait"],
    ["ArrowLeft", "todo", "all"],
    ["ArrowRight", "done", "all"],
    ["ArrowLeft", "all", "done"],
    ["Home", "wait", "all"],
    ["End", "todo", "done"],
  ] as const)("moves with %s from %s to %s, focusing it and selecting it", (key, from, to) => {
    const onSelect = renderTabs(from);
    const start = tabs()[TABS.findIndex((tab) => tab.key === from)];
    start.focus();

    fireEvent.keyDown(start, { key });

    expect(onSelect).toHaveBeenCalledWith(to);
    expect(document.activeElement).toBe(tabs()[TABS.findIndex((tab) => tab.key === to)]);
  });

  it("ignores any other key", () => {
    const onSelect = renderTabs("todo");
    fireEvent.keyDown(tabs()[1], { key: "a" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("scrolls inside its own row on a narrow screen rather than wrapping or widening the page", () => {
    renderTabs();
    const list = screen.getByRole("tablist");
    expect(list.className).toContain("overflow-x-auto");
    expect(list.className).not.toContain("flex-wrap");
  });

  it("fades the edge of the tab row where more tabs sit off-screen on a phone", () => {
    renderTabs();
    const list = screen.getByRole("tablist");
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: 420 });
    fireEvent.scroll(list);

    expect(list).toHaveAttribute("data-more", "end");
    expect(list).toHaveClass(...SCROLL_HINT.split(" "));
  });

  // Under a finger a press needs about 44px (WCAG 2.5.5, Apple and Android guidance); on a phone
  // this control is one of the page's main ways around, so it gets that height.
  it("gives each tab a 44px press on a phone, chosen or not", () => {
    renderTabs("wait");

    for (const tab of tabs()) expectPhoneTarget(tab);
  });
});
