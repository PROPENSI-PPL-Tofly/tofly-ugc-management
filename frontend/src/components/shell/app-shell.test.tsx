import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell";

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
});
