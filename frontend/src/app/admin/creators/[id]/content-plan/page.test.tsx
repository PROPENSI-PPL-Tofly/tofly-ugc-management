import { render, screen } from "@testing-library/react";
import ContentPlanPage from "./page";

describe("ContentPlanPage", () => {
  it("says the plan is still being built rather than showing an empty page", () => {
    render(<ContentPlanPage />);

    expect(screen.getByText(/sedang dikerjakan/i)).toBeInTheDocument();
  });

  it("offers the way back to the table it was opened from", () => {
    render(<ContentPlanPage />);

    expect(screen.getByRole("link", { name: /kembali ke creator database/i })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
  });
});
