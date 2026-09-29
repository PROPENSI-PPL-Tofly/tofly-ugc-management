import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { currentRole } from "@/lib/session.server";
import AdminLayout from "./layout";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ currentRole: vi.fn() }));

async function renderLayout() {
  render(
    await AdminLayout({
      children: <p>Data admin</p>,
      params: Promise.resolve({}),
    } as Parameters<typeof AdminLayout>[0]),
  );
}

describe("Admin area", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("shows its pages to a signed-in admin", async () => {
    vi.mocked(currentRole).mockResolvedValue("admin");

    await renderLayout();

    expect(screen.getByText("Data admin")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  // Told why rather than bounced: a bookmarked page that silently turns into the login screen
  // reads like a broken link.
  it("tells a visitor who is not signed in to sign in first, without rendering the page", async () => {
    vi.mocked(currentRole).mockResolvedValue(null);

    await renderLayout();

    expect(screen.getByRole("heading", { name: "Perlu masuk" })).toBeInTheDocument();
    expect(screen.getByText("Masuk dulu untuk membuka halaman ini.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
    // The only way forward, so it is the primary (blue) button.
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveClass("bg-accent");
    expect(screen.getByText("Tofly Creator Management System")).toBeInTheDocument();
    expect(screen.queryByText("Data admin")).not.toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  // TC-09-06: no admin menu, no data, and a way back to the creator's own page.
  it("tells a signed-in creator the page is not theirs, without rendering it", async () => {
    vi.mocked(currentRole).mockResolvedValue("creator");

    await renderLayout();

    expect(screen.getByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
    expect(screen.getByText("Halaman ini hanya untuk Admin.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke Task Saya" })).toHaveAttribute(
      "href",
      "/creator/tasks",
    );
    expect(screen.queryByText("Data admin")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
