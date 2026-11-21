import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { formatJakartaDay, formatTimestamp } from "@/lib/format";
import { reactivateAdmin } from "@/lib/admin-users-api";
import { adminUser } from "./admin.fixture";
import { AdminUserTable } from "./admin-user-table";

const refresh = vi.fn();

vi.mock("@/lib/admin-users-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-users-api")>();
  return { ...actual, reactivateAdmin: vi.fn() };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh }),
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Pengguna Admin's table", () => {
  it("gives every admin one row of the six facts, no more and no fewer", () => {
    render(
      <AdminUserTable
        users={[adminUser(), adminUser({ id: "second", email: "salsa@example.com" })]}
        total={2}
      />,
    );

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    // The header plus one row per admin: six facts and one actions cell.
    expect(rows).toHaveLength(3);
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("cell")).toHaveLength(7);
    }
  });

  // PBI-23 does not backfill a name: the email is the name the list can honestly show, and the
  // pages that print an admin's name (23.10, 23.11) read it the same way.
  it("reads a nameless admin by their email, and a Super Admin by their role", () => {
    render(
      <AdminUserTable
        users={[
          adminUser({
            name: "  ",
            email: "nameless@example.com",
            role: "super_admin",
            isActive: false,
          }),
        ]}
        total={1}
      />,
    );

    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    // The name cell falls back to the email, and the email cell carries it too.
    expect(within(row).getAllByText("nameless@example.com")).toHaveLength(2);
    expect(within(row).getByText("Super Admin")).toBeInTheDocument();
    expect(within(row).getByText("Nonaktif")).toBeInTheDocument();
  });

  it("shows the last sign-in as a Jakarta moment and the date added as a Jakarta day", () => {
    const signIn = "2026-11-10T03:00:00.000Z";
    const added = "2026-10-01T02:00:00.000Z";

    render(
      <AdminUserTable
        users={[adminUser({ lastSignInAt: signIn, createdAt: added })]}
        total={1}
      />,
    );

    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(within(row).getByText(formatTimestamp(signIn))).toBeInTheDocument();
    expect(within(row).getByText(formatJakartaDay(added))).toBeInTheDocument();
  });

  it("says so when an admin has never signed in", () => {
    render(<AdminUserTable users={[adminUser({ lastSignInAt: null })]} total={1} />);

    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(within(row).getAllByRole("cell")[4]).toHaveTextContent("—");
  });
});

describe("the admin list's row actions", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(reactivateAdmin).mockReset().mockResolvedValue({ ok: true });
  });

  it("gives every row Ubah and a state-changing action", () => {
    render(
      <AdminUserTable
        users={[
          adminUser({ id: "one" }),
          adminUser({ id: "two", isActive: false }),
        ]}
        total={2}
      />,
    );

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByRole("button", { name: "Ubah" })).toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: "Nonaktifkan" })).toBeInTheDocument();
    expect(within(rows[2]).getByRole("button", { name: "Aktifkan" })).toBeInTheDocument();
  });

  // A changed admin has to show up in the server-rendered rows without a full reload, and the
  // toast has to live outside the row so it does not vanish when the new rows arrive.
  it("refreshes the page and says so after an action succeeded", async () => {
    render(
      <AdminUserTable
        users={[adminUser({ id: "u1", isActive: false })]}
        total={1}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aktifkan" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Admin diaktifkan kembali.");
  });
});
