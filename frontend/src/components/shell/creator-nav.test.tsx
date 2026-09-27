import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { CreatorNav } from "./creator-nav";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

describe("CreatorNav", () => {
  it("names itself as the creator menu", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
  });

  it("leads to Task Saya", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Task Saya" })).toHaveAttribute(
      "href",
      "/creator/tasks",
    );
  });

  it.each(["/creator/tasks", "/creator/tasks/abc"])(
    "marks Task Saya as current on %s",
    (path) => {
      vi.mocked(usePathname).mockReturnValue(path);

      render(<CreatorNav />);

      expect(screen.getByRole("link", { name: "Task Saya" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  );

  // "/creator/tasks-archive" shares the prefix but is not below the page.
  it.each(["/creator", "/creator/tasks-archive"])("leaves Task Saya plain on %s", (path) => {
    vi.mocked(usePathname).mockReturnValue(path);

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Task Saya" })).not.toHaveAttribute("aria-current");
  });
});
