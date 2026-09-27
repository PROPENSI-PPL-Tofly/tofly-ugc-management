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

  it("sends a visitor who is not signed in to the login page", async () => {
    vi.mocked(currentRole).mockResolvedValue(null);

    await renderLayout().catch(() => undefined);

    expect(redirect).toHaveBeenCalledWith("/login");
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
