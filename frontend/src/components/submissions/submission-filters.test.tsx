import { render, screen } from "@testing-library/react";
import { SubmissionFilters } from "./submission-filters";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/submissions",
}));

describe("SubmissionFilters", () => {
  it("renders a search input and status filter dropdown", () => {
    render(<SubmissionFilters q="" status="all" />);

    expect(screen.getByPlaceholderText(/cari kreator atau konten/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
  });

  it("shows reset button when filters are active", () => {
    render(<SubmissionFilters q="salsa" status="draft_review" />);

    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("does not show reset button when filters are all default", () => {
    render(<SubmissionFilters q="" status="all" />);

    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });
});
