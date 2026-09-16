import { render, screen, within } from "@testing-library/react";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("names the product and the module being worked on", () => {
    render(
      <AppShell title="Creator Database" subtitle="Data terpusat creator">
        <p>isi</p>
      </AppShell>,
    );

    expect(screen.getByText("Tofly")).toBeInTheDocument();
    expect(screen.getByText(/UGC Task Management/i)).toBeInTheDocument();
  });

  it("shows the page title and subtitle in the top bar", () => {
    render(
      <AppShell title="Creator Database" subtitle="Data terpusat creator">
        <p>isi</p>
      </AppShell>,
    );

    expect(screen.getByRole("heading", { name: "Creator Database" })).toBeInTheDocument();
    expect(screen.getByText("Data terpusat creator")).toBeInTheDocument();
  });

  it("links to the section that exists and leaves the rest visibly unavailable", () => {
    render(
      <AppShell title="Creator Database">
        <p>isi</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation");

    expect(within(nav).getByRole("link", { name: "Creator Database" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
    expect(within(nav).queryByRole("link", { name: "Rate & Invoicing" })).not.toBeInTheDocument();
    expect(within(nav).getByText("Rate & Invoicing")).toHaveAttribute("aria-disabled", "true");
  });

  it("renders the page underneath it", () => {
    render(
      <AppShell title="Creator Database">
        <p>isi halaman</p>
      </AppShell>,
    );

    expect(screen.getByText("isi halaman")).toBeInTheDocument();
  });
});
