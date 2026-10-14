import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

/**
 * What an admin sees for a creator that does not exist: a deleted creator, an old link, or an
 * id typed by hand. It stays inside the admin frame, so the menu and the way back are there,
 * and it never repeats what was typed into the address.
 */
export default function CreatorNotFound() {
  return (
    <AppShell title="Detail Creator">
      <Panel>
        <EmptyState
          title="Creator tidak ditemukan"
          hint="Creator ini tidak ada atau sudah dihapus. Periksa lagi tautannya."
          action={
            <Link href="/admin/creators" className={buttonClasses()}>
              Kembali ke Creator Database
            </Link>
          }
        />
      </Panel>
    </AppShell>
  );
}
