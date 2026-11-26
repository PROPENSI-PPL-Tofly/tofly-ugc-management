import { fireEvent, render, screen, within } from "@testing-library/react";
import { adminUser, listResponse } from "@/components/admin-users/admin.fixture";
import { fetchAdminUsers } from "@/lib/admin-users.server";
import { currentSession } from "@/lib/session.server";
import AdminUsersPage from "./page";

/** What Next throws to stop rendering and show the not-found screen. */
class NotFound extends Error {}

vi.mock("@/lib/admin-users.server", () => ({ fetchAdminUsers: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ currentSession: vi.fn() }));

let pageSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/users",
  useSearchParams: () => pageSearchParams,
  notFound: () => {
    throw new NotFound();
  },
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  pageSearchParams = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value) ? (value[0] ?? "") : (value ?? ""),
    ]),
  );
  render(await AdminUsersPage({ searchParams: Promise.resolve(params) }));
}

describe("Pengguna Admin page", () => {
  beforeEach(() => {
    vi.mocked(currentSession).mockReset();
    vi.mocked(currentSession).mockResolvedValue({ role: "admin", isSuperAdmin: true });
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

describe("Pengguna Admin page states", () => {
  beforeEach(() => {
    vi.mocked(currentSession).mockReset();
    vi.mocked(currentSession).mockResolvedValue({ role: "admin", isSuperAdmin: true });
    vi.mocked(fetchAdminUsers).mockReset();
  });

  it("falls back to the first page and names the junk it was given", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [], total: 0 }),
    });

    await renderPage({ page: "abc" });

    expect(fetchAdminUsers).toHaveBeenCalledWith(1, { q: "" });
    expect(screen.getByRole("status")).toHaveTextContent(
      'Halaman "abc" tidak dikenal, menampilkan halaman pertama.',
    );
  });

  it("says the list is empty before a single admin was added", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [], total: 0 }),
    });

    await renderPage();

    expect(screen.getByText("Belum ada admin yang terdaftar.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps an empty search apart from an empty roster", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [], total: 0 }),
    });

    await renderPage({ q: "zzz" });

    expect(
      screen.getByText("Tidak ada admin yang cocok dengan pencarian."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset filter" })).toBeInTheDocument();
    expect(screen.queryByText("Belum ada admin yang terdaftar.")).toBeNull();
  });

  it("offers the way back to the first page when the page is past the end", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [], page: 9, total: 4 }),
    });

    await renderPage({ page: "9" });

    expect(screen.getByText("Tidak ada admin di halaman ini.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ke halaman pertama" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });

  it("explains a failed load and retries the same search and page", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({ kind: "unavailable" });

    await renderPage({ q: "rangga", page: "2" });

    expect(screen.getByRole("alert")).toHaveTextContent("Data admin tidak bisa dimuat.");
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/admin/users?q=rangga&page=2",
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  // A stale page (the role changed under it) must not draw an empty list as if there were
  // nobody: the backend's refusal is the same not-found an Admin's typed address gets.
  it("reads the backend's refusal as not found", async () => {
    vi.mocked(fetchAdminUsers).mockResolvedValue({ kind: "refused" });

    await expect(renderPage()).rejects.toThrow(NotFound);
  });
});

describe("Pengguna Admin search", () => {
  beforeEach(() => {
    vi.mocked(currentSession).mockReset();
    vi.mocked(currentSession).mockResolvedValue({ role: "admin", isSuperAdmin: true });
    vi.mocked(fetchAdminUsers).mockReset();
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [adminUser()], total: 1 }),
    });
  });

  it("shows the search the address carries in its box", async () => {
    await renderPage({ q: "rangga" });

    expect(screen.getByRole("searchbox", { name: /cari admin/i })).toHaveValue("rangga");
  });
});

describe("Pengguna Admin gate", () => {
  beforeEach(() => {
    vi.mocked(currentSession).mockReset();
    vi.mocked(fetchAdminUsers).mockReset();
  });

  it("gives an Admin the not-found page instead of the list, and asks for none", async () => {
    vi.mocked(currentSession).mockResolvedValue({ role: "admin", isSuperAdmin: false });

    await expect(renderPage()).rejects.toThrow(NotFound);
    expect(fetchAdminUsers).not.toHaveBeenCalled();
  });

  it("gives a signed-out visitor the not-found page too", async () => {
    vi.mocked(currentSession).mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow(NotFound);
    expect(fetchAdminUsers).not.toHaveBeenCalled();
  });
});

describe("Pengguna Admin's way to add someone", () => {
  beforeEach(() => {
    vi.mocked(currentSession).mockReset();
    vi.mocked(currentSession).mockResolvedValue({ role: "admin", isSuperAdmin: true });
    vi.mocked(fetchAdminUsers).mockReset();
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      kind: "loaded",
      list: listResponse({ items: [adminUser()], total: 1 }),
    });
  });

  it("starts Tambah Admin from the page header", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Tambah Admin" }));

    expect(await screen.findByRole("dialog", { name: "Tambah Admin" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
  });
});
