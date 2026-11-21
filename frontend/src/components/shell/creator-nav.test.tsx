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

  it("leads to the Dashboard first, then Tugas Saya, Performa and Pembayaran, as the prototype orders them", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Tugas Saya",
      "Performa Konten",
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
    expect(screen.getByRole("link", { name: "Tugas Saya" })).not.toHaveAttribute("aria-current");
  });

  it("leaves the Dashboard plain on Tugas Saya", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("leads to Tugas Saya", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Tugas Saya" })).toHaveAttribute(
      "href",
      "/creator/tasks",
    );
  });

  it.each(["/creator/tasks", "/creator/tasks/abc"])(
    "marks Tugas Saya as current on %s",
    (path) => {
      vi.mocked(usePathname).mockReturnValue(path);

      render(<CreatorNav />);

      expect(screen.getByRole("link", { name: "Tugas Saya" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  );

  // PBI-19, 19.4: the Performa page holds the Akun Terhubung panel.
  it("leads to Performa and marks it as current there", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/performance");

    render(<CreatorNav />);

    const link = screen.getByRole("link", { name: "Performa Konten" });
    expect(link).toHaveAttribute("href", "/creator/performance");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Pembayaran" })).not.toHaveAttribute("aria-current");
  });

  it("leads to Pembayaran and marks it as current there", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/payments");

    render(<CreatorNav />);

    const link = screen.getByRole("link", { name: "Pembayaran" });
    expect(link).toHaveAttribute("href", "/creator/payments");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  // Seen at 375px once Performa joined: the bar was laid out for three tiles, so Pembayaran
  // dropped to a second row on its own. Every place sits in the one row of equal tiles.
  it("lays its four places out as four equal tiles in one row on a phone", () => {
    vi.mocked(usePathname).mockReturnValue("/creator/tasks");

    render(<CreatorNav />);

    expect(screen.getByRole("list")).toHaveClass("grid", "grid-cols-4");
  });

  // "/creator/tasks-archive" shares the prefix but is not below the page.
  it.each(["/creator", "/creator/tasks-archive"])("leaves Tugas Saya plain on %s", (path) => {
    vi.mocked(usePathname).mockReturnValue(path);

    render(<CreatorNav />);

    expect(screen.getByRole("link", { name: "Tugas Saya" })).not.toHaveAttribute("aria-current");
  });
});
