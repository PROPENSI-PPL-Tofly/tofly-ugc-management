import { render, screen, within } from "@testing-library/react";
import { AppShell } from "./app-shell";
import { FRAME_THEMES } from "./frame-theme";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/creators",
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("AppShell", () => {
  it("names the page and puts the content in main", () => {
    render(
        <AppShell title="Creator Database" subtitle="Semua creator dalam satu tabel">
          <p>konten</p>
        </AppShell>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Creator Database" })).toBeInTheDocument();
    expect(screen.getByText("Semua creator dalam satu tabel")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("konten");
  });

  it("marks the creator database as the current place in the navigation", () => {
    render(
        <AppShell title="Creator Database">
          <p>konten</p>
        </AppShell>,
    );

    const link = screen.getByRole("link", { name: "Creator Database" });
    expect(link).toHaveAttribute("href", "/admin/creators");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Menu admin" })).toBeInTheDocument();
  });

  it("stays the admin frame when no role is given", () => {
    render(
        <AppShell title="Creator Database">
          <p>konten</p>
        </AppShell>,
    );

    expect(screen.getByRole("link", { name: "tofly" })).toHaveAttribute("href", "/admin/creators");
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });

  // The role and the way out sit together in one account block, not as two stray lines.
  it("groups who is signed in with the Keluar button", () => {
    render(
        <AppShell title="Creator Database">
          <p>konten</p>
        </AppShell>,
    );

    const account = screen.getByRole("group", { name: "Akun" });
    expect(account).toHaveTextContent("Masuk sebagai");
    expect(account).toHaveTextContent("Admin");
    expect(within(account).getByRole("button", { name: "Keluar" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu admin" })).not.toContainElement(account);
  });

  describe("for a creator", () => {
    it("shows the creator menu and none of the admin's places", () => {
      render(
          <AppShell role="creator" title="Task Saya">
            <p>konten</p>
          </AppShell>,
      );

      expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Menu admin" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Creator Database" })).not.toBeInTheDocument();
    });

    it("sends the wordmark home to the Dashboard and says whose frame it is", () => {
      render(
          <AppShell role="creator" title="Task Saya">
            <p>konten</p>
          </AppShell>,
      );

      expect(screen.getByRole("link", { name: "tofly" })).toHaveAttribute(
        "href",
        "/creator/dashboard",
      );
      expect(screen.getAllByText("Creator").length).toBeGreaterThan(0);
    });
  });

  // The approved design: on a phone the rail is a top bar in the role's colour, with the role
  // named beside the wordmark, and the menu is a bar of tiles at the foot of the screen.
  describe("its frame, drawn by the role's theme", () => {
    function rail() {
      return screen.getByRole("link", { name: "tofly" }).closest("aside") as HTMLElement;
    }

    it("names the role in a tag beside the wordmark, outside the wordmark's link", () => {
      render(
        <AppShell role="creator" title="Dashboard">
          <p>konten</p>
        </AppShell>,
      );

      const tag = within(rail()).getByText("Creator", { selector: "[data-role-tag]" });
      expect(screen.getByRole("link", { name: "tofly" })).not.toContainElement(tag);
    });

    it("draws each role's frame with that role's theme, and only that one", () => {
      const { unmount } = render(
        <AppShell role="creator" title="Dashboard">
          <p>konten</p>
        </AppShell>,
      );
      expect(rail()).toHaveClass(...FRAME_THEMES.creator.rail.split(" "));
      expect(rail()).toHaveAttribute("data-frame", "creator");
      unmount();

      render(
        <AppShell role="admin" title="Creator Database">
          <p>konten</p>
        </AppShell>,
      );
      expect(rail()).toHaveClass(...FRAME_THEMES.admin.rail.split(" "));
      expect(rail()).toHaveAttribute("data-frame", "admin");
      expect(rail()).not.toHaveClass(...FRAME_THEMES.creator.rail.split(" "));
    });

    it("pins the menu to the foot of a phone screen and keeps the content clear of it", () => {
      render(
        <AppShell role="creator" title="Dashboard">
          <p>konten</p>
        </AppShell>,
      );

      const bar = screen.getByRole("navigation", { name: "Menu creator" }).parentElement;
      expect(bar).toHaveClass("max-md:fixed", "max-md:bottom-0", "max-md:inset-x-0");
      expect(screen.getByRole("main").parentElement).toHaveClass("max-md:pb-28");
    });

    it("marks the current place with the role's own colour", () => {
      render(
        <AppShell title="Creator Database">
          <p>konten</p>
        </AppShell>,
      );

      expect(screen.getByRole("link", { name: "Creator Database" })).toHaveClass(
        ...FRAME_THEMES.admin.placeOn.split(" "),
      );
    });
  });
});

describe("FRAME_THEMES", () => {
  it("gives each role its own colours and its own name", () => {
    expect(FRAME_THEMES.creator.label).toBe("Creator");
    expect(FRAME_THEMES.admin.label).toBe("Admin");
    expect(FRAME_THEMES.creator.rail).not.toBe(FRAME_THEMES.admin.rail);
    expect(FRAME_THEMES.creator.placeOn).not.toBe(FRAME_THEMES.admin.placeOn);
  });
});