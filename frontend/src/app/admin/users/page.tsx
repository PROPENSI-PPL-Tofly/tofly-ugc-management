import { AdminUserTable } from "@/components/admin-users/admin-user-table";
import { AppShell } from "@/components/shell/app-shell";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import {
  adminUserQuery,
  parseAdminUserFilters,
  parseAdminUserPage,
} from "@/lib/admin-users";
import { fetchAdminUsers } from "@/lib/admin-users.server";

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
  const { page } = parseAdminUserPage(params);
  const filters = parseAdminUserFilters(params);

  const outcome = await fetchAdminUsers(page, filters);
  const result = outcome.kind === "loaded" ? outcome.list : null;

  // The view without its page, for the page links; with it, for a retry and the way back.
  const query = adminUserQuery(filters, 1);
  const returnTo = new URLSearchParams(adminUserQuery(filters, page)).toString();
  const retryHref = returnTo ? `/admin/users?${returnTo}` : "/admin/users";

  return (
    <AppShell role="super_admin" title="Pengguna Admin">
      <Panel>
        {result ? (
          <>
            <AdminUserTable users={result.items} />
            <Pagination
              basePath="/admin/users"
              noun="admin"
              query={query}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </>
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-muted">
            Data admin tidak bisa dimuat.
          </p>
        )}
      </Panel>
    </AppShell>
  );
}
