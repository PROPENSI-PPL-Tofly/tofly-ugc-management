import { fireEvent, render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { SCROLL_HINT } from "@/components/ui/use-scroll-hint";
import { AdminNav } from "./admin-nav";
import { PHONE_TARGET } from "@/components/ui/touch-target";

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

  it("lists Rate & Invoicing and marks it current on its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/invoicing");

    render(<AdminNav />);

    const link = screen.getByRole("link", { name: "Rate & Invoicing" });
    expect(link).toHaveAttribute("href", "/admin/invoicing");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Content Plan as current on its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/content-plan");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Creator Database" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("links Content Plan to its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan" })).toHaveAttribute(
      "href",
      "/admin/content-plan",
    );
  });

  it("does not mistake one creator's content plan for Content Plan", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators/abc/content-plan");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not treat a path that only starts with the same letters as the same place", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/content-plan-archive");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks Rate & Invoicing as current on its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/invoicing");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Rate & Invoicing" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("links Rate & Invoicing to its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Rate & Invoicing" })).toHaveAttribute(
      "href",
      "/admin/invoicing",
    );
  });

  // On a phone the menu is one sideways-scrolling row; "Rate & Invoicing" sat cut off at the
  // edge with nothing to say the row moves.
  it("fades the edge of the phone menu where more places sit off-screen", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);
    const list = screen.getByRole("list");
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 288 });
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: 381 });
    fireEvent.scroll(list);

    expect(list).toHaveAttribute("data-more", "end");
    expect(list).toHaveClass(...SCROLL_HINT.split(" "));
  });

  // Under a finger a press needs about 44px (WCAG 2.5.5, Apple and Android guidance); on a phone
  // this control is one of the page's main ways around, so it gets that height.
  it("gives each place a 44px press on a phone", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    for (const link of screen.getAllByRole("link")) expect(link).toHaveClass(PHONE_TARGET);
  });
});
