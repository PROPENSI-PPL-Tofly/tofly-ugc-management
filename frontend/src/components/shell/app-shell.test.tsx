import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/creators" }));

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
    expect(screen.getByText("Admin")).toBeInTheDocument();
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

    it("sends the wordmark home to Task Saya and says whose frame it is", () => {
      render(
        <AppShell role="creator" title="Task Saya">
          <p>konten</p>
        </AppShell>,
      );

      expect(screen.getByRole("link", { name: "tofly" })).toHaveAttribute("href", "/creator/tasks");
      expect(screen.getByText("Creator")).toBeInTheDocument();
    });
  });
});
