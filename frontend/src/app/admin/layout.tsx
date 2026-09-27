import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/access-denied";
import { currentRole } from "@/lib/session.server";

// Every admin page renders per request behind the signed-in role, never from a static build.
export const dynamic = "force-dynamic";

/**
 * The admin area: signed out goes to /login, a creator is told the page is not theirs. The
 * backend guards every admin endpoint as well; this decides what the browser is shown.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const role = await currentRole();
  if (role === null) redirect("/login");
  if (role !== "admin") {
    return (
      <AccessDenied
        reason="Halaman ini hanya untuk Admin."
        home="/creator/tasks"
        homeLabel="Kembali ke Task Saya"
      />
    );
  }
  return children;
}
