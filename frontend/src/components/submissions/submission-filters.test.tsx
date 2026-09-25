import { render, screen, fireEvent, act } from "@testing-library/react";
import { SubmissionFilters } from "./submission-filters";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/submissions",
}));

beforeEach(() => {
  mockReplace.mockClear();
});

describe("SubmissionFilters", () => {
  it("renders search, status, type, and overdue controls", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);

    expect(screen.getByPlaceholderText(/cari kreator atau konten/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tipe/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows reset button when search is active", () => {
    render(<SubmissionFilters q="salsa" status="all" type="all" overdue={false} />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("shows reset button when overdue is checked", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("does not show reset button when all filters are default", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("calls router.replace when reset is clicked", () => {
    render(<SubmissionFilters q="test" status="all" type="all" overdue={false} />);

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("calls router.replace with status when status select changes", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "draft_review" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions?status=draft_review", { scroll: false });
  });

  it("calls router.replace with type when type select changes", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);

    fireEvent.change(screen.getByLabelText(/tipe/i), { target: { value: "specific" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions?type=specific", { scroll: false });
  });

  it("calls router.replace with overdue when checkbox is checked", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions?overdue=true", { scroll: false });
  });

  it("clears status from the query when status is set back to all", () => {
    render(<SubmissionFilters q="" status="draft_review" type="all" overdue={false} />);

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "all" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("clears type from the query when type is set back to all", () => {
    render(<SubmissionFilters q="" status="all" type="specific" overdue={false} />);

    fireEvent.change(screen.getByLabelText(/tipe/i), { target: { value: "all" } });

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("removes overdue from the query when checkbox is unchecked", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockReplace).toHaveBeenCalledWith("/admin/submissions", { scroll: false });
  });

  it("pushes the search term after the debounce delay", () => {
    vi.useFakeTimers();
    try {
      render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);

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
      render(<SubmissionFilters q="salsa" status="all" type="all" overdue={false} />);

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
});
