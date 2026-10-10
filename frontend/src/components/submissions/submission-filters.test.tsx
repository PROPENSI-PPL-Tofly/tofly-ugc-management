import { render, screen, fireEvent, act } from "@testing-library/react";
import { SubmissionFilters } from "./submission-filters";

const mockReplace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParams,
  usePathname: () => "/admin/submissions",
}));

beforeEach(() => {
  mockReplace.mockClear();
  searchParams = new URLSearchParams();
});

describe("SubmissionFilters", () => {
  it("renders search, hand-in, type, and overdue controls", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

    expect(screen.getByPlaceholderText(/cari kreator atau konten/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Kiriman")).toBeInTheDocument();
    expect(screen.getByLabelText(/tipe/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows reset button when search is active", () => {
    searchParams = new URLSearchParams({ q: "salsa" });
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("shows reset button when overdue is checked", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("does not show reset button when all filters are default", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("calls router.replace when reset is clicked", () => {
    searchParams = new URLSearchParams({ q: "test" });
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("offers every draft, first hand-ins or resubmits, and no status any more", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

    const options = Array.from(
      (screen.getByLabelText("Kiriman") as HTMLSelectElement).options,
    ).map((option) => [option.value, option.text]);

    expect(options).toEqual([
      ["all", "Semua"],
      ["false", "Kiriman pertama"],
      ["true", "Dikirim ulang"],
    ]);
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Draft Revised")).not.toBeInTheDocument();
  });

  it("calls router.replace with resubmitted when the hand-in select changes", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

    fireEvent.change(screen.getByLabelText("Kiriman"), { target: { value: "true" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions?resubmitted=true", { scroll: false });
  });

  it("calls router.replace with type when type select changes", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

    fireEvent.change(screen.getByLabelText(/tipe/i), { target: { value: "specific" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions?type=specific", { scroll: false });
  });

  it("calls router.replace with overdue when checkbox is checked", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions?overdue=true", { scroll: false });
  });

  it("clears resubmitted from the query when the hand-in filter is set back to all", () => {
    render(<SubmissionFilters resubmitted="false" type="all" overdue={false} />);

    fireEvent.change(screen.getByLabelText("Kiriman"), { target: { value: "all" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("clears type from the query when type is set back to all", () => {
    render(<SubmissionFilters resubmitted="all" type="specific" overdue={false} />);

    fireEvent.change(screen.getByLabelText(/tipe/i), { target: { value: "all" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("removes overdue from the query when checkbox is unchecked", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("pushes the search term after the debounce delay", () => {
    vi.useFakeTimers();
    try {
      render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

      fireEvent.change(screen.getByPlaceholderText(/cari kreator atau konten/i), {
        target: { value: "salsa" },
      });
      expect(mockReplace).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(mockReplace).toHaveBeenCalledWith("/admin/submissions?q=salsa", { scroll: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears q from the query when the search term is emptied", () => {
    vi.useFakeTimers();
    try {
      searchParams = new URLSearchParams({ q: "salsa" });
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);

      fireEvent.change(screen.getByPlaceholderText(/cari kreator atau konten/i), {
        target: { value: "" },
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets search and every filter together, and nothing puts them back", () => {
    vi.useFakeTimers();
    try {
      searchParams = new URLSearchParams({ q: "salsa", resubmitted: "false", overdue: "true" });
      render(<SubmissionFilters resubmitted="false" type="all" overdue />);

      fireEvent.click(screen.getByRole("button", { name: /reset/i }));
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
      expect(screen.getByRole("searchbox", { name: "Cari draft" })).toHaveValue("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the search box at the length the API accepts", () => {
    render(<SubmissionFilters resubmitted="all" type="all" overdue={false} />);
    expect(screen.getByRole("searchbox", { name: "Cari draft" })).toHaveAttribute("maxLength", "100");
  });
});
