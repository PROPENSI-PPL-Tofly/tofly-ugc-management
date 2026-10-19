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

  it("leads to the Dashboard first, then Task Saya, then Pembayaran", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Task Saya",
      "Pembayaran",
    ]);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/creator/dashboard",
    );
  });

  it("marks only the Dashboard as current on the dashboard", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/dashboard");

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Task Saya" })).not.toHaveAttribute("aria-current");
  });

  it("leaves the Dashboard plain on Task Saya", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
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

  it("leads to Pembayaran and marks it as current there", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/payments");

    render(<CreatorNav />);

    const link = screen.getByRole("link", { name: "Pembayaran" });
    expect(link).toHaveAttribute("href", "/creator/payments");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  // "/creator/tasks-archive" shares the prefix but is not below the page.
  it.each(["/creator", "/creator/tasks-archive"])("leaves Task Saya plain on %s", (path) => {
    vi.mocked(usePathname).mockReturnValue(path);

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Task Saya" })).not.toHaveAttribute("aria-current");
  });
});
