import { fireEvent, render, screen } from "@testing-library/react";
import type { ContentPlanCounts } from "@/lib/content-plan";
import { CREATOR_CONTENT_LIST_ID, CreatorContentTabBar } from "./creator-content-tab-bar";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

const PAGE = "/admin/creators/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT = "11111111-1111-4111-8111-111111111111";

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
  usePathname: () => PAGE,
}));

const COUNTS: ContentPlanCounts = { all: 12, action: 2, waiting: 8, done: 2 };

describe("CreatorContentTabBar", () => {
  beforeEach(() => {
    replace.mockClear();
    searchParams = new URLSearchParams();
  });

  it("offers the Content Plan's four tabs with their counters, naming the list they switch", () => {
    render(<CreatorContentTabBar active="all" counts={COUNTS} />);

    expect(screen.getByRole("tablist", { name: "Tab konten periode" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Semua",
      "Perlu Approval2",
      "Menunggu Kreator8",
      "Selesai",
    ]);
    expect(screen.getByRole("tab", { name: "Semua" })).toHaveAttribute("aria-controls", CREATOR_CONTENT_LIST_ID);
  });

  it("moves to the pressed tab on the same period, keeping the search and dropping status, sort and page", () => {
    searchParams = new URLSearchParams({
      contract: CONTRACT,
      q: "kopi",
      status: "scheduled",
      sort: "desc",
      page: "2",
    });
    render(<CreatorContentTabBar active="all" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("tab", { name: "Perlu Approval2" }));

    expect(replace).toHaveBeenCalledWith(`${PAGE}?contract=${CONTRACT}&tab=action&q=kopi`, {
      scroll: false,
    });
  });

  it("goes back to the bare address for Semua on the newest period", () => {
    searchParams = new URLSearchParams({ tab: "done" });
    render(<CreatorContentTabBar active="done" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("tab", { name: "Semua" }));

    expect(replace).toHaveBeenCalledWith(PAGE, { scroll: false });
  });
});
