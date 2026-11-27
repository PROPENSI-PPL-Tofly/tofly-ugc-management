import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CreatorPerformance } from "@/lib/executive-dashboard";
import { PerformaCreatorTable } from "./performa-creator-table";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function creator(overrides: Partial<CreatorPerformance>): CreatorPerformance {
  return {
    creatorId: "c-1",
    creatorName: "Ayu",
    spending: 1_000_000,
    contentSent: 3,
    contentQuota: 4,
    onTimeRate: 75,
    views: 10_000,
    costPer1000Views: 100_000,
    ...overrides,
  };
}

const CREATORS = [
  creator({ creatorId: "c-1", creatorName: "Ayu", views: 10_000 }),
  creator({ creatorId: "c-2", creatorName: "Bima", views: null, onTimeRate: null, costPer1000Views: null }),
  creator({ creatorId: "c-3", creatorName: "Citra", views: 50_000 }),
];

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  window.history.replaceState(null, "", "/admin/dashboard?range=12");
});

function address(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function names(): string[] {
  const table = screen.getByRole("table", { name: "Performa Creator" });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}

describe("PerformaCreatorTable", () => {
  it("lists creators in the order from the address, with no data last and shown as a dash", () => {
    render(<PerformaCreatorTable creators={CREATORS} state={{ months: 6, sort: "views", order: "desc" }} />);

    expect(names()).toEqual(["Citra", "Ayu", "Bima"]);
    const bima = screen.getByRole("row", { name: /Bima/ });
    expect(within(bima).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Bima",
      "Rp1.000.000",
      "3 / 4",
      "—",
      "—",
      "—",
    ]);
  });

  it("opens each creator's Creator Detail from the row", () => {
    render(<PerformaCreatorTable creators={CREATORS} state={{ months: 6, sort: "views", order: "desc" }} />);

    expect(screen.getByRole("link", { name: "Ayu" })).toHaveAttribute("href", "/admin/creators/c-1");
  });

  it("marks the sorted column and writes a header press into the address, keeping the range", () => {
    render(<PerformaCreatorTable creators={CREATORS} state={{ months: 12, sort: "views", order: "desc" }} />);

    expect(screen.getByRole("columnheader", { name: "Views" })).toHaveAttribute("aria-sort", "descending");

    fireEvent.click(screen.getByRole("button", { name: "Creator" }));
    expect(address()).toBe("/admin/dashboard?range=12&sort=name&order=asc");

    // Back to the default order (most views first), which the address leaves out.
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(address()).toBe("/admin/dashboard?range=12");
  });

  it("sorts the rows it has on a header press, without a navigation that would load the dashboard again", () => {
    render(<PerformaCreatorTable creators={CREATORS} state={{ months: 12, sort: "views", order: "desc" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Creator" }));

    expect(names()).toEqual(["Ayu", "Bima", "Citra"]);
    expect(screen.getByRole("columnheader", { name: "Creator" })).toHaveAttribute("aria-sort", "ascending");
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("says no creator had a contract in the range instead of an empty table", () => {
    render(<PerformaCreatorTable creators={[]} state={{ months: 6, sort: "views", order: "desc" }} />);

    expect(screen.getByText("Belum ada creator dengan kontrak di rentang ini.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
