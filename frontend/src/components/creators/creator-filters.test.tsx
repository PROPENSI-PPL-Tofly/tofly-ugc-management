import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatorFilters } from "./creator-filters";

const replace = vi.fn();
let currentQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/creators",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

const FILTERS = { q: "", contract: "all", productivity: "all", page: 1 } as const;

function renderFilters(props: Partial<Parameters<typeof CreatorFilters>[0]> = {}) {
  render(<CreatorFilters filters={FILTERS} shown={5} total={12} {...props} />);
}

describe("CreatorFilters", () => {
  beforeEach(() => {
    replace.mockClear();
    currentQuery = "";
  });

  it("reports how much of the roster is on screen", () => {
    renderFilters();

    expect(screen.getByText("5 dari 12 creator")).toBeInTheDocument();
  });

  it("waits for typing to settle before searching", () => {
    vi.useFakeTimers();
    renderFilters();

    fireEvent.change(screen.getByLabelText(/cari nama/i), { target: { value: "rang" } });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(replace).toHaveBeenCalledWith("/admin/creators?q=rang");

    vi.useRealTimers();
  });

  it("only searches for the term the typing settled on", () => {
    vi.useFakeTimers();
    renderFilters();
    const input = screen.getByLabelText(/cari nama/i);

    fireEvent.change(input, { target: { value: "ran" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: "rangga" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/admin/creators?q=rangga");

    vi.useRealTimers();
  });

  it("does not search again when the term has not changed", async () => {
    vi.useFakeTimers();
    currentQuery = "q=rangga";
    renderFilters({ filters: { ...FILTERS, q: "rangga" } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(replace).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("filters by contract status", async () => {
    renderFilters();

    await userEvent.selectOptions(screen.getByLabelText(/status kontrak/i), "active");

    expect(replace).toHaveBeenCalledWith("/admin/creators?contract=active");
  });

  it("drops the contract filter when everything is chosen again", async () => {
    currentQuery = "contract=active";
    renderFilters({ filters: { ...FILTERS, contract: "active" } });

    await userEvent.selectOptions(screen.getByLabelText(/status kontrak/i), "all");

    expect(replace).toHaveBeenCalledWith("/admin/creators");
  });

  it("filters by productivity", async () => {
    renderFilters();

    await userEvent.selectOptions(screen.getByLabelText(/produktivitas/i), "risk");

    expect(replace).toHaveBeenCalledWith("/admin/creators?productivity=risk");
  });

  it("sends the reader back to the first page when a filter changes", async () => {
    currentQuery = "page=4";
    renderFilters({ filters: { ...FILTERS, page: 4 } });

    await userEvent.selectOptions(screen.getByLabelText(/status kontrak/i), "expired");

    expect(replace).toHaveBeenCalledWith("/admin/creators?contract=expired");
  });

  it("clears everything at once", async () => {
    currentQuery = "q=rangga&contract=active&productivity=good&page=2";
    renderFilters({ filters: { q: "rangga", contract: "active", productivity: "good", page: 2 } });

    await userEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(replace).toHaveBeenCalledWith("/admin/creators");
  });

  it("starts with whatever the URL already asked for", () => {
    renderFilters({ filters: { q: "rangga", contract: "active", productivity: "good", page: 1 } });

    expect(screen.getByLabelText(/cari nama/i)).toHaveValue("rangga");
    expect(screen.getByLabelText(/status kontrak/i)).toHaveValue("active");
    expect(screen.getByLabelText(/produktivitas/i)).toHaveValue("good");
  });
});
