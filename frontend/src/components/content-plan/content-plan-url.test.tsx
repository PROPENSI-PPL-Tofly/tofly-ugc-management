import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  DEFAULT_CONTENT_PLAN_PARAMS,
  type ContentPlanCounts,
  type ContentPlanRow,
} from "@/lib/content-plan";
import { ContentPlanBoard } from "./content-plan-board";
import { ContentPlanFilters } from "./content-plan-filters";
import { ContentPlanTabBar } from "./content-plan-tab-bar";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

// Held still on purpose: on a slow connection the address bar keeps showing the old query
// long after a press, and every test below presses a second control inside that gap.
const searchParams = new URLSearchParams();

// The panel that a row opens loads its content; these tests only care about the address.
vi.mock("@/lib/content-detail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-detail")>()),
  fetchContentDetail: () => new Promise(() => {}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/content-plan",
}));

const COUNTS: ContentPlanCounts = { all: 42, action: 3, waiting: 12, done: 27 };

const ROW: ContentPlanRow = {
  contentId: "content-1",
  name: "Video Review Kopi",
  creatorId: "id-1",
  creatorName: "Salsa",
  type: "evergreen",
  deadline: "2026-10-15",
  status: "scheduled",
  tags: [],
  revisionCount: 0,
};

/** The three parts of the page that rewrite its address, side by side as the page lays them out. */
function renderPlan() {
  render(
    <>
      <ContentPlanTabBar active="all" counts={COUNTS} />
      <ContentPlanFilters
        state={DEFAULT_CONTENT_PLAN_PARAMS}
        counts={COUNTS}
        creators={[
          { id: "id-1", name: "Salsa" },
          { id: "id-2", name: "Rangga" },
        ]}
      />
      <ContentPlanBoard items={[ROW]} filtered={false} tab="all" sort="desc" />
    </>,
  );
}

function tickCreator(name: string) {
  const trigger = screen.getByRole("button", { name: /^Creator:/ });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("checkbox", { name }));
}

function lastAddress(): string {
  return replace.mock.calls.at(-1)?.[0] as string;
}

describe("the Content Plan's address, written by its tabs, filters and sort together", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a creator ticked a moment ago when a tab is pressed before the address has it", () => {
    renderPlan();

    tickCreator("Salsa");
    fireEvent.click(screen.getByRole("tab", { name: "Menunggu Kreator12" }));

    expect(lastAddress()).toBe("/admin/content-plan?tab=waiting&creator=id-1");
  });

  it("keeps a creator ticked a moment ago when the Deadline header is pressed", () => {
    renderPlan();

    tickCreator("Salsa");
    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(lastAddress()).toBe("/admin/content-plan?creator=id-1&sort=asc");
  });

  it("keeps a tab pressed a moment ago when a creator is ticked", () => {
    renderPlan();

    fireEvent.click(screen.getByRole("tab", { name: "Selesai" }));
    tickCreator("Rangga");

    expect(lastAddress()).toBe("/admin/content-plan?tab=done&creator=id-2");
  });

  it("turns the sort back to its default on a second quick press, not to the same side twice", () => {
    renderPlan();

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    expect(lastAddress()).toBe("/admin/content-plan?sort=asc");

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    expect(lastAddress()).toBe("/admin/content-plan");
  });

  it("keeps the sort when a tab press follows it, as the tab's own rule drops it", () => {
    renderPlan();

    tickCreator("Salsa");
    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Perlu Approval3" }));

    // A tab change keeps the picks and lets go of the old tab's sort.
    expect(lastAddress()).toBe("/admin/content-plan?tab=action&creator=id-1");
  });

  it("does not bring back filters that Reset cleared when a tab is pressed right after", () => {
    renderPlan();

    tickCreator("Salsa");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("tab", { name: "Menunggu Kreator12" }));
    act(() => vi.advanceTimersByTime(400));

    expect(lastAddress()).toBe("/admin/content-plan?tab=waiting");
  });

  // Found in the app: the row's ?content= link was written straight into the address, which
  // cancelled the filter change still on its way. The list stayed unfiltered and the tick went.
  it("keeps a creator ticked a moment ago when a row is opened before the address has it", () => {
    renderPlan();

    tickCreator("Salsa");
    fireEvent.click(screen.getByText("Video Review Kopi"));

    expect(lastAddress()).toBe("/admin/content-plan?creator=id-1&content=content-1");
  });

  it("builds a search typed after a tab press on that tab", () => {
    renderPlan();

    fireEvent.click(screen.getByRole("tab", { name: "Menunggu Kreator12" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari konten atau creator" }), {
      target: { value: "kopi" },
    });
    act(() => vi.advanceTimersByTime(400));

    expect(lastAddress()).toBe("/admin/content-plan?tab=waiting&q=kopi");
  });
});
