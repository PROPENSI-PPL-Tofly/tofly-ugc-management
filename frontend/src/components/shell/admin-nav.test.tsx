import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { AdminNav } from "./admin-nav";
import { SuperAdminProvider } from "./super-admin-context";
import { expectPhoneTarget } from "@/test/touch-target";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

describe("AdminNav", () => {
  // PBI-23 AC 1 and 3: the Super Admin menu stays hidden from everyone else.
  it("adds Log Aktivitas for a Super Admin, the seventh tile, in two rows of four on a phone", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/log-aktivitas");

    render(
      <SuperAdminProvider isSuperAdmin>
        <AdminNav />
      </SuperAdminProvider>,
    );

    const link = screen.getByRole("link", { name: "Log Aktivitas" });
    expect(link).toHaveAttribute("href", "/admin/log-aktivitas");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("link").at(-1)).toBe(link);
    // Seven across leaves about 45px a tile at 375px, which cuts off "Pembayaran" (seen locally).
    expect(screen.getByRole("list")).toHaveClass("grid", "grid-cols-4");
  });

  it("hides Log Aktivitas from a regular Admin", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(
      <SuperAdminProvider isSuperAdmin={false}>
        <AdminNav />
      </SuperAdminProvider>,
    );

    expect(screen.queryByRole("link", { name: "Log Aktivitas" })).not.toBeInTheDocument();
  });

  it("hides Log Aktivitas when nothing says who is signed in", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    expect(screen.queryByRole("link", { name: "Log Aktivitas" })).not.toBeInTheDocument();
  });

  it("marks the creator database as current on its own page and below it", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators/abc/content-plan");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Kreator" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("leaves the item plain elsewhere", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/settings");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Kreator" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("lists Pembayaran and marks it current on its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/invoicing");

    render(<AdminNav />);

    const link = screen.getByRole("link", { name: "Pembayaran" });
    expect(link).toHaveAttribute("href", "/admin/invoicing");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("lists Performa Konten between the content work and the invoicing, and marks it current on its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/performance");

    render(<AdminNav />);

    const link = screen.getByRole("link", { name: "Performa Konten" });
    expect(link).toHaveAttribute("href", "/admin/performance");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Content Plan as current on its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/content-plan");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Content Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Kreator" })).not.toHaveAttribute(
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

  it("marks Pembayaran as current on its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/invoicing");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Pembayaran" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("links Pembayaran to its page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Pembayaran" })).toHaveAttribute(
      "href",
      "/admin/invoicing",
    );
  });

  // Prototype (Sprint 4, PBI-24): the executive Dashboard is the admin's first place.
  it("puts Dashboard first, linked to the executive dashboard and current there", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/dashboard");

    render(<AdminNav />);

    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("href", "/admin/dashboard");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link")[0]).toBe(link);
  });

  // The approved design replaces the phone's sideways-scrolling row (where "Pembayaran"
  // sat cut off at the edge) with equal tiles at the foot of the screen, one per place, so with
  // Dashboard there are five: every place is in sight, nothing to scroll to, no edge to fade.
  it("lays the places out as five equal tiles on a phone, none of them cut off", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);
    const list = screen.getByRole("list");

    expect(list).toHaveClass("grid", "grid-cols-5");
    expect(list).not.toHaveClass("overflow-x-auto");
    expect(list).not.toHaveAttribute("data-more");
  });

  // A tile carries an icon above its words; the icon is decoration, so a place keeps its name.
  it("gives each place an icon that screen readers skip", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    for (const link of screen.getAllByRole("link")) {
      const icon = link.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Kreator",
      "Content Plan",
      "Performa Konten",
      "Pembayaran",
    ]);
  });

  // Under a finger a press needs about 44px (WCAG 2.5.5, Apple and Android guidance); on a phone
  // this control is one of the page's main ways around, so it gets that height.
  it("gives each place a 44px press on a phone", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");

    render(<AdminNav />);

    for (const link of screen.getAllByRole("link")) expectPhoneTarget(link);
  });
});

describe("the Super Admin's extra place", () => {
  function renderAs(role: "admin" | "super_admin") {
    vi.mocked(usePathname).mockReturnValue("/admin/creators");
    render(
      <SuperAdminProvider isSuperAdmin={role === "super_admin"}>
        <AdminNav />
      </SuperAdminProvider>,
    );
  }

  it("keeps the five everyday places for an Admin and no Super Admin door", () => {
    renderAs("admin");

    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: "Pengguna Admin" })).toBeNull();
  });

  it("adds Pengguna Admin and Log Aktivitas beside them for a Super Admin", () => {
    renderAs("super_admin");

    expect(screen.getByRole("link", { name: "Pengguna Admin" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Kreator",
      "Content Plan",
      "Performa Konten",
      "Pembayaran",
      "Pengguna Admin",
      "Log Aktivitas",
    ]);
  });
});
