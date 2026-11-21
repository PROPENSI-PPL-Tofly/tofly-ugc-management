import { render, screen, within } from "@testing-library/react";
import { adminUser, listResponse } from "@/components/admin-users/admin.fixture";
import { fetchAdminUsers } from "@/lib/admin-users.server";
import { currentRole } from "@/lib/session.server";
import AdminUsersPage from "./page";

/** What Next throws to stop rendering and show the not-found screen. */
class NotFound extends Error {}

vi.mock("@/lib/admin-users.server", () => ({ fetchAdminUsers: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ currentRole: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new NotFound();
  },
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  render(await AdminUsersPage({ searchParams: Promise.resolve(params) }));
}

describe("Pengguna Admin page", () => {
  beforeEach(() => {
    vi.mocked(currentRole).mockReset();
    vi.mocked(currentRole).mockResolvedValue("super_admin");
    vi.mocked(fetchAdminUsers).mockReset();
  });

  it("shows the six columns and the rows the API answered", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [adminUser()], total: 1 }),
    });

    await renderPage();

    expect(fetchAdminUsers).toHaveBeenCalledWith(1, { q: "" });
    expect(screen.getByRole("heading", { level: 1, name: "Pengguna Admin" })).toBeInTheDocument();

    const table = screen.getByRole("table");
    for (const column of ["Nama", "Email", "Peran", "Status", "Terakhir masuk", "Ditambahkan"]) {
      expect(within(table).getByRole("columnheader", { name: column })).toBeInTheDocument();
    }

    const row = within(table).getByRole("row", { name: /Rangga Pratama/ });
    expect(within(row).getByText("Rangga Pratama")).toBeInTheDocument();
    expect(within(row).getByText("rangga@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Admin")).toBeInTheDocument();
    expect(within(row).getByText("Aktif")).toBeInTheDocument();
  });

  it("loads the page named in the address", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [adminUser()], page: 2, total: 12 }),
    });

    await renderPage({ page: "2" });

    expect(fetchAdminUsers).toHaveBeenCalledWith(2, { q: "" });
    expect(screen.getByText("Halaman 2 dari 2")).toBeInTheDocument();
  });

  it("narrows by the search the address carries", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [adminUser()], total: 1 }),
    });

    await renderPage({ q: "  rangga  " });

    expect(fetchAdminUsers).toHaveBeenCalledWith(1, { q: "rangga" });
  });
});
