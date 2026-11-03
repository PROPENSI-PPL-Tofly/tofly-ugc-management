import {
  connectHref,
  type ConnectedAccount,
} from "@/lib/connected-accounts";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-connection";

/**
 * The "Hubungkan" prompt beside a creator's link list (PBI-27, 27.6): while an account is not
 * connected none of its links can ever sync, so the list points at the same connect link the
 * Akun Terhubung panel above offers (AC 20). A plain anchor, as the panel's is: the backend
 * answers with a redirect to the platform, which needs a full page load.
 */
export function ConnectPrompt({
  accounts,
}: Readonly<{ accounts: readonly ConnectedAccount[] }>) {
  const unconnected = accounts.filter((account) => !account.connected);
  if (unconnected.length === 0) return null;

  return (
    <div className="border-b border-rule px-5 py-3 text-[13px]">
      {unconnected.map((account) => (
        <p key={account.platform} className="text-muted">
          Akun {SOCIAL_PLATFORM_LABELS[account.platform]} belum terhubung.{" "}
          <a
            href={connectHref(account.platform)}
            className="font-semibold text-ink underline decoration-rule underline-offset-[3px] hover:decoration-ink"
          >
            Hubungkan
          </a>{" "}
          agar angka performanya bisa disinkronkan.
        </p>
      ))}
    </div>
  );
}
