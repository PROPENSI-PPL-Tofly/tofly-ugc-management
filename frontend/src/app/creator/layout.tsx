import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/access-denied";
import { currentRole } from "@/lib/session.server";

// Every creator page renders per request behind the signed-in role, never from a static build.
export const dynamic = "force-dynamic";

/**
 * The creator area: signed out goes to /login, an admin is told the page is not theirs. The
 * backend guards every creator endpoint as well; this decides what the browser is shown.
 */
export default async function CreatorLayout({ children }: LayoutProps<"/creator">) {
  const role = await currentRole();
  if (role === null) redirect("/login");
  if (role !== "creator") {
    return (
      <AccessDenied
        reason="Halaman ini hanya untuk creator."
        home="/admin/creators"
        homeLabel="Kembali ke Creator Database"
      />
    );
  }
  return children;
}
