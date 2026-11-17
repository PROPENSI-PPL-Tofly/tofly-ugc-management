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
        <AppShell title="Kreator">
          <p>konten</p>
        </AppShell>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Kreator" })).toBeInTheDocument();
    // No subtitle under the page title.
    expect(screen.getByRole("heading", { level: 1 }).nextElementSibling).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("konten");
  });

  it("puts a page's action beside its title, in the page header", () => {
    render(
        <AppShell title="Kreator" action={<button type="button">Tambah Creator</button>}>
          <p>konten</p>
        </AppShell>,
    );

    const header = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(header.tagName).toBe("HEADER");
    expect(within(header).getByRole("button", { name: "Tambah Creator" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("button")).toBeNull();
  });

  it("marks the creator database as the current place in the navigation", () => {
    render(
        <AppShell title="Kreator">
          <p>konten</p>
        </AppShell>,
    );

    const link = screen.getByRole("link", { name: "Kreator" });
    expect(link).toHaveAttribute("href", "/admin/creators");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Menu admin" })).toBeInTheDocument();
  });

  it("stays the admin frame when no role is given", () => {
    render(
        <AppShell title="Kreator">
          <p>konten</p>
        </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Tofly Creator Management System" })).toHaveAttribute("href", "/admin/creators");
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });

  // The role and the way out sit together in one account block, not as two stray lines.
  it("groups who is signed in with the Keluar button", () => {
    render(
        <AppShell title="Kreator">
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
          <AppShell role="creator" title="Tugas Saya">
            <p>konten</p>
          </AppShell>,
      );

      expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Menu admin" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Kreator" })).not.toBeInTheDocument();
    });

    it("sends the wordmark home to the Dashboard and says whose frame it is", () => {
      render(
          <AppShell role="creator" title="Tugas Saya">
            <p>konten</p>
          </AppShell>,
      );

      expect(screen.getByRole("link", { name: "Tofly Creator Management System" })).toHaveAttribute(
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
      return screen.getByRole("link", { name: "Tofly Creator Management System" }).closest("aside") as HTMLElement;
    }

    it("names the role in a tag beside the wordmark, outside the wordmark's link", () => {
      render(
        <AppShell role="creator" title="Dashboard">
          <p>konten</p>
        </AppShell>,
      );

      const tag = within(rail()).getByText("Creator", { selector: "[data-role-tag]" });
      expect(screen.getByRole("link", { name: "Tofly Creator Management System" })).not.toContainElement(tag);
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
        <AppShell role="admin" title="Kreator">
          <p>konten</p>
        </AppShell>,
      );
      expect(rail()).toHaveClass(...FRAME_THEMES.admin.rail.split(" "));
      expect(rail()).toHaveAttribute("data-frame", "admin");
    });

    // The creator's sidebar looks as the admin's does: navy at every width, the same rows.
    it("draws a creator's sidebar in the admin's navy at every width", () => {
      render(
        <AppShell role="creator" title="Tugas Saya">
          <p>konten</p>
        </AppShell>,
      );

      expect(rail()).toHaveClass("bg-ink", "text-accent-ink");
      expect(rail().className).not.toMatch(/max-md:bg-accent-deep|md:bg-surface/);
      expect(screen.getByRole("link", { name: "Tugas Saya" })).toHaveClass(
        ...FRAME_THEMES.admin.placeOn.split(" "),
      );
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
        <AppShell title="Kreator">
          <p>konten</p>
        </AppShell>,
      );

      expect(screen.getByRole("link", { name: "Kreator" })).toHaveClass(
        ...FRAME_THEMES.admin.placeOn.split(" "),
      );
    });
  });
});

describe("FRAME_THEMES", () => {
  it("gives each role its own name, drawn in the same colours", () => {
    expect(FRAME_THEMES.creator.label).toBe("Creator");
    expect(FRAME_THEMES.admin.label).toBe("Admin");
    const { label: creatorLabel, ...creatorColours } = FRAME_THEMES.creator;
    const { label: adminLabel, ...adminColours } = FRAME_THEMES.admin;
    expect(creatorLabel).not.toBe(adminLabel);
    expect(creatorColours).toEqual(adminColours);
  });
});