import { act, fireEvent, render, screen } from "@testing-library/react";
import { filterPill, pickFilter } from "@/test/filters";
import { vi } from "vitest";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/creators",
}));

import { CreatorFilters } from "./creator-filters";
import { expectPhoneTarget } from "@/test/touch-target";

function renderFilters(overrides: Record<string, string> = {}) {
  searchParams = new URLSearchParams(overrides);
  render(<CreatorFilters />);
}

function search() {
  return screen.getByRole("searchbox", { name: /cari creator/i });
}

function contractStatus() {
  return filterPill("Status kontrak");
}

function productivity() {
  return filterPill("Produktivitas");
}

/** The words of every choice behind a one-choice filter's pill, read by opening it. */
function choicesOf(pill: HTMLElement) {
  fireEvent.click(pill);
  const words = screen.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent);
  fireEvent.click(pill);
  return words;
}

/** Past the debounce, so the URL update the typing scheduled actually runs. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

describe("CreatorFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a search box and both dropdowns", () => {
    renderFilters();

    expect(search()).toBeInTheDocument();
    expect(contractStatus()).toBeInTheDocument();
    expect(productivity()).toBeInTheDocument();
  });

  // No creator can exist without a contract, so "Belum ada kontrak" is not offered.
  it("offers the contract statuses a creator can actually be in", () => {
    renderFilters();

    expect(choicesOf(contractStatus())).toEqual(["Semua", "Aktif", "Berakhir", "Belum mulai"]);
  });

  it("offers every productivity band the API accepts, including no data yet", () => {
    renderFilters();

    expect(choicesOf(productivity())).toEqual([
      "Semua",
      "Baik",
      "Perlu Perhatian",
      "Berisiko",
      "Belum Ada Data",
    ]);
  });

  it("reflects current filter values in inputs", () => {
    renderFilters({ q: "rangga", contractStatus: "active" });

    expect(search()).toHaveValue("rangga");
    expect(contractStatus()).toHaveTextContent("Status kontrak: Aktif");
  });

  it("waits for a pause in typing before updating the URL", () => {
    renderFilters();

    fireEvent.change(search(), { target: { value: "ran" } });
    fireEvent.change(search(), { target: { value: "rangga" } });

    // Still mid-word: nothing has been sent yet.
    expect(replace).not.toHaveBeenCalled();

    settle();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("q=rangga"), {
      scroll: false,
    });
  });

  it("updates the URL with the API's parameter name on a dropdown change", () => {
    renderFilters();

    pickFilter("Status kontrak", "Aktif");

    expect(replace).toHaveBeenCalledWith(expect.stringContaining("contractStatus=active"), {
      scroll: false,
    });
  });

  it("drops the page number when a filter changes", () => {
    renderFilters({ page: "3" });

    pickFilter("Status kontrak", "Berakhir");

    expect(replace.mock.calls.at(-1)![0]).not.toContain("page=");
  });

  it("does not show the reset button when no filter is active", () => {
    renderFilters();

    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("shows the reset button when any filter is active", () => {
    renderFilters({ q: "rangga" });

    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("resets every filter back to the bare path", () => {
    renderFilters({ q: "rangga", contractStatus: "active" });

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });

  // UAT: the search cleared but the filters came back, because the debounce still saw the old
  // search in the URL and re-sent the filters with it.
  it("keeps the filters cleared after Reset once the search debounce would have fired", () => {
    renderFilters({ q: "rangga", contractStatus: "active", productivity: "risk" });

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    settle();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/admin/creators", { scroll: false });
    expect(search()).toHaveValue("");
  });

  // The box says what it searches, as it did before the bar was shared.
  it("asks for a name or an email in the empty search box", () => {
    renderFilters();
    expect(search()).toHaveAttribute("placeholder", "Nama atau email…");
  });

  it("stops the search box at the length the API accepts", () => {
    renderFilters();
    expect(search()).toHaveAttribute("maxLength", "100");
  });

  it("filters by productivity band", () => {
    renderFilters();

    pickFilter("Produktivitas", "Berisiko");

    expect(replace).toHaveBeenCalledWith(expect.stringContaining("productivity=risk"), {
      scroll: false,
    });
  });

  it("goes back to the bare path when the only filter is set back to all", () => {
    renderFilters({ contractStatus: "active" });

    pickFilter("Status kontrak", "Semua");

    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });

  // Its picks read as chips under the bar, with Reset beside them, as every other list's do.
  it("shows each choice in use as a chip that clears only it", () => {
    renderFilters({ productivity: "risk", contractStatus: "active" });

    const chips = screen.getByRole("group", { name: "Filter aktif" });
    expect(chips).toHaveTextContent("Produktivitas: Berisiko");
    expect(chips).toHaveTextContent("Status kontrak: Aktif");
    fireEvent.click(screen.getByRole("button", { name: "Hapus filter Produktivitas: Berisiko" }));

    expect(replace).toHaveBeenLastCalledWith("/admin/creators?contractStatus=active", { scroll: false });
  });

  // Back/forward changes q in the URL without any typing; the box has to follow it.
  it("follows a search the URL changed on its own", () => {
    searchParams = new URLSearchParams({ q: "rangga" });
    const { rerender } = render(<CreatorFilters />);

    searchParams = new URLSearchParams({ q: "salsa" });
    rerender(<CreatorFilters />);

    expect(search()).toHaveValue("salsa");
  });

  // Measured at 375px: the search box 34px tall and the selects 32px. On a phone they are the
  // presses that narrow the roster, so each gets 44px, as Reset does.
  it("gives the search, both selects and Reset a 44px press on a phone", () => {
    renderFilters({ q: "nadia" });

    expectPhoneTarget(search());
    expectPhoneTarget(contractStatus());
    expectPhoneTarget(productivity());
    expectPhoneTarget(screen.getByRole("button", { name: /reset/i }));
  });

  // The approved phone design: the roster's two selects fold behind one Filter press, as on
  // Task Saya and the Content Plan, so the search keeps the row and nothing wraps or scrolls.
  describe("folded on a phone", () => {
    function toggle() {
      return screen.getByRole("button", { name: /^Filter/ });
    }

    it("puts both selects behind a Filter press that opens and closes them", () => {
      renderFilters();

      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      const panel = document.getElementById(toggle().getAttribute("aria-controls")!);
      expect(panel).toContainElement(contractStatus());
      expect(panel).toHaveClass("max-sm:hidden");

      fireEvent.click(toggle());

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(panel).not.toHaveClass("max-sm:hidden");
    });

    // The search shows itself in its own box; only what is folded away is counted.
    it("counts the selects in use on the press, not the search", () => {
      renderFilters({ q: "rangga", contractStatus: "active", productivity: "risk" });

      expect(toggle()).toHaveAccessibleName("Filter, 2 aktif");
    });

    it("says on each pill what it is narrowed to", () => {
      renderFilters({ productivity: "risk" });

      expect(productivity()).toHaveTextContent("Produktivitas: Berisiko");
      expect(contractStatus()).toHaveTextContent("Status kontrak: Semua");
    });

    // Productivity is what the roster is mostly narrowed by, so it is the first choice offered.
    it("offers Produktivitas before Status kontrak", () => {
      renderFilters();

      expect(
        screen.getAllByRole("button", { name: /^(Produktivitas|Status kontrak):/ }).map((pill) =>
          pill.textContent?.split(":")[0],
        ),
      ).toEqual(["Produktivitas", "Status kontrak"]);
    });
  });
});
