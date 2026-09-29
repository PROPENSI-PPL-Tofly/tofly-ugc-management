import { AccessDenied } from "@/components/shell/access-denied";
import { currentRole } from "@/lib/session.server";

// Every creator page renders per request behind the signed-in role, never from a static build.
export const dynamic = "force-dynamic";

/**
 * The creator area: signed out is asked to sign in first, an admin is told the page is not theirs. The
 * backend guards every creator endpoint as well; this decides what the browser is shown.
 */
export default async function CreatorLayout({ children }: LayoutProps<"/creator">) {
  const role = await currentRole();
  if (role === null) {
    return (
      <AccessDenied
        title="Perlu masuk"
        reason="Masuk dulu untuk membuka halaman ini."
        home="/login"
        homeLabel="Masuk"
      />
    );
  }
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
