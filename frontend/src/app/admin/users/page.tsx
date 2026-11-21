import { AdminUserTable } from "@/components/admin-users/admin-user-table";
import { AdminUserFilters } from "@/components/admin-users/admin-user-filters";
import { AddAdminTrigger } from "@/components/admin-users/add-admin-trigger";
import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import {
  ADMIN_USERS_PATH,
  adminUserQuery,
  parseAdminUserFilters,
  parseAdminUserPage,
} from "@/lib/admin-users";
import { fetchAdminUsers } from "@/lib/admin-users.server";
import { currentRole } from "@/lib/session.server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pengguna Admin - Tofly",
};

// Fetched on the server so the first paint already has the rows and the backend address stays
// out of the browser. The URL is the only state: the page number and the search come in as
// search params, which keeps the view linkable and reload-safe.
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { page, invalid } = parseAdminUserPage(params);
  const filters = parseAdminUserFilters(params);

  // The menu is hidden from an Admin, and a typed address must not show what the menu hides.
  // The backend refuses too; this is what the browser is shown (AC 3).
  const role = await currentRole();
  if (role !== "super_admin") {
    notFound();
  }

  const outcome = await fetchAdminUsers(page, filters);

  // A stale page (the role changed under it) must not draw an empty list as if there were
  // nobody: the backend's refusal is the same not-found an Admin's typed address gets.
  if (outcome.kind === "refused") {
    notFound();
  }

  const result = outcome.kind === "loaded" ? outcome.list : null;

  // The view without its page, for the page links; with it, for a retry and the way back.
  const query = adminUserQuery(filters, 1);
  const returnTo = new URLSearchParams(adminUserQuery(filters, page)).toString();
  const retryHref = returnTo ? `${ADMIN_USERS_PATH}?${returnTo}` : ADMIN_USERS_PATH;

  return (
    <AppShell role="super_admin" title="Pengguna Admin" action={<AddAdminTrigger />}>
      {invalid !== null ? (
        // Rendered as text: whatever was typed into the URL is shown back, never interpreted.
        <p
          role="status"
          className="mb-4 rounded-(--radius-control) border border-amber-wash bg-amber-wash px-4 py-2 text-[13px] text-amber-ink"
        >
          {`Halaman "${invalid}" tidak dikenal, menampilkan halaman pertama.`}
        </p>
      ) : null}

      <Panel>
        <AdminUserFilters />
        {result ? (
          <>
            <AdminUserTable
              users={result.items}
              total={result.total}
              filtered={filters.q !== ""}
            />
            <Pagination
              basePath={ADMIN_USERS_PATH}
              noun="admin"
              query={query}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </>
        ) : (
          <LoadError title="Data admin tidak bisa dimuat." retryHref={retryHref} />
        )}
      </Panel>
    </AppShell>
  );
}
