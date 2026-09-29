import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { currentRole } from "@/lib/session.server";
import CreatorLayout from "./layout";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ currentRole: vi.fn() }));

async function renderLayout() {
  render(
    await CreatorLayout({
      children: <p>Tugas creator</p>,
      params: Promise.resolve({}),
    } as Parameters<typeof CreatorLayout>[0]),
  );
}

describe("Creator area", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("shows its pages to a signed-in creator", async () => {
    vi.mocked(currentRole).mockResolvedValue("creator");

    await renderLayout();

    expect(screen.getByText("Tugas creator")).toBeInTheDocument();
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
    expect(screen.getByText("Tofly Creator Management System")).toBeInTheDocument();
    expect(screen.queryByText("Tugas creator")).not.toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("tells a signed-in admin the page is not theirs, without rendering it", async () => {
    vi.mocked(currentRole).mockResolvedValue("admin");

    await renderLayout();

    expect(screen.getByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
    expect(screen.getByText("Halaman ini hanya untuk creator.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke Creator Database" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
    expect(screen.queryByText("Tugas creator")).not.toBeInTheDocument();
  });
});
