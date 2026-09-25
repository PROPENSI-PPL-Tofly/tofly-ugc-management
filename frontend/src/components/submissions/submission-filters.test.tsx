import { render, screen } from "@testing-library/react";
import { SubmissionFilters } from "./submission-filters";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/submissions",
}));

describe("SubmissionFilters", () => {
  it("renders search, status, type, and overdue controls", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);

    expect(screen.getByPlaceholderText(/cari kreator atau konten/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tipe/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows reset button when any filter is active", () => {
    render(<SubmissionFilters q="salsa" status="all" type="all" overdue={false} />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("shows reset when overdue is checked", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("does not show reset button when all filters are default", () => {
    render(<SubmissionFilters q="" status="all" type="all" overdue={false} />);
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });
});
