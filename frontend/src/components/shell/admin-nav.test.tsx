import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { AdminNav } from "./admin-nav";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

describe("AdminNav", () => {
  it("marks the creator database as current on its own page and below it", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators/abc/content-plan");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Creator Database" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("leaves the item plain elsewhere", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/settings");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Creator Database" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
