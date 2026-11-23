import { AccessDenied } from "@/components/shell/access-denied";
import { homeFor, type Role } from "@/lib/session";
import { currentRole } from "@/lib/session.server";

/** The one way on from a missing page, by who is looking. */
const WAY_ON: Record<Role, string> = {
  admin: "Kembali ke Kreator",
  creator: "Kembali ke Dashboard",
};

/**
 * What a visitor sees at an address no page answers, such as a bookmarked per-creator Content
 * Plan, which the Creator Detail page replaced. The same card as a refused page: what happened
 * and the one way on, back to the signed-in role's own home, or to sign in. No app frame, as the
 * page does not draw a role's menu.
 */
export default async function NotFound() {
  // A session that cannot be read is treated as none: a missing page must still answer.
  const role = await currentRole().catch(() => null);

  return (
    <AccessDenied
      title="Halaman tidak ditemukan"
      reason="Alamat ini tidak ada atau sudah dipindahkan. Periksa lagi tautannya."
      home={role ? homeFor(role) : "/login"}
      homeLabel={role ? WAY_ON[role] : "Masuk"}
    />
  );
}
