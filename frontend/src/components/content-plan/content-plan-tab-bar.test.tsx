import { fireEvent, render, screen } from "@testing-library/react";
import type { ContentPlanCounts } from "@/lib/content-plan";
import { ContentPlanTabBar } from "./content-plan-tab-bar";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

const COUNTS: ContentPlanCounts = { all: 42, action: 3, waiting: 12, done: 27 };

describe("ContentPlanTabBar", () => {
  beforeEach(() => {
    replace.mockClear();
    searchParams = new URLSearchParams();
  });

  it("moves to the tab pressed, keeping the search and dropping the status, sort and page", () => {
    searchParams = new URLSearchParams({
      tab: "all",
      q: "salsa",
      creator: "id-1",
      status: "pending",
      sort: "asc",
      page: "3",
    });
    render(<ContentPlanTabBar active="all" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("tab", { name: "Menunggu Kreator12" }));

    expect(replace).toHaveBeenCalledWith(
      "/admin/content-plan?tab=waiting&q=salsa&creator=id-1",
      { scroll: false },
    );
  });

  it("drops the tab parameter when Semua is pressed", () => {
    searchParams = new URLSearchParams({ tab: "waiting", q: "salsa" });
    render(<ContentPlanTabBar active="waiting" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("tab", { name: "Semua" }));

    expect(replace).toHaveBeenCalledWith("/admin/content-plan?q=salsa", { scroll: false });
  });

  it("opens the bare address when Semua is pressed on a bare view", () => {
    render(<ContentPlanTabBar active="all" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("tab", { name: "Semua" }));

    expect(replace).toHaveBeenCalledWith("/admin/content-plan", { scroll: false });
  });
});
