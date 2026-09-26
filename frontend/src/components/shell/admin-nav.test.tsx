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

  it("marks Content Plan (All) as current on its page and on the draft queue it leads to", () => {
    for (const path of ["/admin/content-plan", "/admin/submissions"]) {
      vi.mocked(usePathname).mockReturnValue(path);

      const { unmount } = render(<AdminNav />);

      expect(screen.getByRole("link", { name: "Content Plan (All)" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("link", { name: "Creator Database" })).not.toHaveAttribute(
        "aria-current",
      );
      unmount();
    }
  });

  it("links Content Plan (All) to its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan (All)" })).toHaveAttribute(
      "href",
      "/admin/content-plan",
    );
  });

  it("does not mistake one creator's content plan for Content Plan (All)", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators/abc/content-plan");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan (All)" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not treat a path that only starts with the same letters as the same place", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/submissions-archive");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan (All)" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
