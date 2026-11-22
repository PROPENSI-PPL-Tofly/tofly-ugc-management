import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { useIsSuperAdmin } from "@/components/shell/super-admin-context";
import { currentSession } from "@/lib/session.server";
import AdminLayout from "./layout";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ currentSession: vi.fn() }));

function SuperAdminState() {
  return <p>{useIsSuperAdmin() ? "Menu Super Admin" : "Menu Admin"}</p>;
}

async function renderLayout() {
  render(
    await AdminLayout({
      children: (
        <>
          <p>Data admin</p>
          <SuperAdminState />
        </>
      ),
      params: Promise.resolve({}),
    } as Parameters<typeof AdminLayout>[0]),
  );
}

describe("Admin area", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("shows its pages to a signed-in admin", async () => {
    vi.mocked(currentSession).mockResolvedValue({ role: "admin", isSuperAdmin: false });

    await renderLayout();

    expect(screen.getByText("Data admin")).toBeInTheDocument();
    expect(screen.getByText("Menu Admin")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("tells its pages when the admin is a Super Admin", async () => {
    vi.mocked(currentSession).mockResolvedValue({ role: "admin", isSuperAdmin: true });

    await renderLayout();

    expect(screen.getByText("Menu Super Admin")).toBeInTheDocument();
  });

  // Told why rather than bounced: a bookmarked page that silently turns into the login screen
  // reads like a broken link.
  it("tells a visitor who is not signed in to sign in first, without rendering the page", async () => {
    vi.mocked(currentSession).mockResolvedValue(null);

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
    vi.mocked(currentSession).mockResolvedValue({ role: "creator", isSuperAdmin: false });

    await renderLayout();

    expect(screen.getByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
    expect(screen.getByText("Halaman ini hanya untuk Admin.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke Dashboard" })).toHaveAttribute(
      "href",
      "/creator/dashboard",
    );
    expect(screen.queryByText("Data admin")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
