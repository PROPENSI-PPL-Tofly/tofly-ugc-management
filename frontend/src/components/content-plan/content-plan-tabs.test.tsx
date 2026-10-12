import { fireEvent, render, screen } from "@testing-library/react";
import { ContentPlanTabs } from "./content-plan-tabs";
import type { ContentPlanCounts } from "@/lib/content-plan";

const COUNTS: ContentPlanCounts = { all: 42, action: 3, waiting: 12, done: 27 };

function renderTabs(active: "all" | "action" | "waiting" | "done" = "all", counts = COUNTS) {
  const onSelect = vi.fn();
  render(<ContentPlanTabs active={active} counts={counts} onSelect={onSelect} />);
  return onSelect;
}

function tab(name: string) {
  return screen.getByRole("tab", { name });
}

describe("ContentPlanTabs", () => {
  it("offers the four tabs in the order Semua to Selesai, counting only the two that count", () => {
    renderTabs();
    expect(screen.getAllByRole("tab").map((node) => node.textContent)).toEqual([
      "Semua",
      "Perlu Approval3",
      "Menunggu Kreator12",
      "Selesai",
    ]);
  });

  it("marks the tab it is on as selected", () => {
    renderTabs("waiting");
    expect(tab("Menunggu Kreator12")).toHaveAttribute("aria-selected", "true");
    expect(tab("Semua")).toHaveAttribute("aria-selected", "false");
  });

  it("turns the Perlu Approval counter red when it counts", () => {
    renderTabs("all", { ...COUNTS, action: 3 });
    const badge = screen.getByTestId("count-action");
    expect(badge).toHaveTextContent("3");
    expect(badge.className).toContain("bg-red");
  });

  it("hides the Perlu Approval counter at zero", () => {
    renderTabs("all", { ...COUNTS, action: 0 });
    expect(screen.queryByTestId("count-action")).not.toBeInTheDocument();
  });

  it("keeps the Menunggu Kreator counter grey, zero included", () => {
    renderTabs("all", { ...COUNTS, waiting: 0 });
    const badge = screen.getByTestId("count-waiting");
    expect(badge).toHaveTextContent("0");
    expect(badge.className).toContain("bg-surface-2");
    expect(badge.className).not.toContain("bg-red");
  });

  it("counts no badge onto Semua or Selesai however large they run", () => {
    renderTabs("all", COUNTS);
    expect(screen.queryByTestId("count-all")).not.toBeInTheDocument();
    expect(screen.queryByTestId("count-done")).not.toBeInTheDocument();
  });

  it("hands the tab that was pressed back so the page can move to it", () => {
    const onSelect = renderTabs();
    fireEvent.click(tab("Perlu Approval3"));
    expect(onSelect).toHaveBeenCalledWith("action");
  });
});
