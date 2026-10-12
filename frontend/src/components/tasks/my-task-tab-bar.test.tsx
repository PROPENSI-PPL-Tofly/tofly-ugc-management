import { fireEvent, render, screen } from "@testing-library/react";
import type { MyTasksCounts } from "@/lib/my-tasks";
import { MY_TASK_LIST_ID, MyTaskTabBar } from "./my-task-tab-bar";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
  usePathname: () => "/creator/tasks",
}));

const COUNTS: MyTasksCounts = { all: 9, action: 4, waiting: 2, done: 3 };

describe("MyTaskTabBar", () => {
  beforeEach(() => {
    replace.mockClear();
    searchParams = new URLSearchParams();
  });

  it("shows the four Task Saya tabs with Perlu Dikerjakan's counter red and Menunggu Admin's grey", () => {
    render(<MyTaskTabBar active="all" counts={COUNTS} />);

    expect(screen.getByRole("tablist", { name: "Tab Task Saya" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((node) => node.textContent)).toEqual([
      "Semua",
      "Perlu Dikerjakan4",
      "Menunggu Admin2",
      "Selesai",
    ]);
    expect(screen.getByTestId("count-action").className).toContain("bg-red");
    expect(screen.getByTestId("count-waiting").className).toContain("bg-surface-2");
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-controls", MY_TASK_LIST_ID);
  });

  it("moves to the tab pressed, keeping the search and filters and dropping the status, sort and page", () => {
    searchParams = new URLSearchParams({
      q: "serum",
      type: "specific",
      period: "month",
      status: "draft_review",
      sort: "desc",
      page: "2",
      content: "c-1",
    });
    render(<MyTaskTabBar active="all" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("tab", { name: "Perlu Dikerjakan4" }));

    expect(replace).toHaveBeenCalledWith(
      "/creator/tasks?tab=action&q=serum&type=specific&period=month",
      { scroll: false },
    );
  });

  it("drops the tab parameter when Semua is pressed", () => {
    searchParams = new URLSearchParams({ tab: "done", q: "serum" });
    render(<MyTaskTabBar active="done" counts={COUNTS} />);

    fireEvent.click(screen.getByRole("tab", { name: "Semua" }));

    expect(replace).toHaveBeenCalledWith("/creator/tasks?q=serum", { scroll: false });
  });

  it("moves with the arrow keys too", () => {
    render(<MyTaskTabBar active="all" counts={COUNTS} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: "Semua" }), { key: "ArrowLeft" });

    expect(replace).toHaveBeenCalledWith("/creator/tasks?tab=done", { scroll: false });
  });
});
