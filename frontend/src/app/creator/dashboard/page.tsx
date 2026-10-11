import { AppShell } from "@/components/shell/app-shell";
import { StatCards } from "@/components/dashboard/stat-cards";
import { buttonClasses } from "@/components/ui/button-classes";
import { nearestDeadlineLabel } from "@/lib/creator-dashboard";
import { fetchCreatorDashboard, type CreatorDashboard } from "@/lib/creator-dashboard.server";
import { MyTasksError } from "@/lib/my-tasks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — Tofly",
};

const BASE_PATH = "/creator/dashboard";

type Loaded =
  | { kind: "ok"; dashboard: CreatorDashboard }
  | { kind: "signed_out" }
  | { kind: "failed" };

async function load(): Promise<Loaded> {
  try {
    return { kind: "ok", dashboard: await fetchCreatorDashboard() };
  } catch (error) {
    return error instanceof MyTasksError && error.status === 401
      ? { kind: "signed_out" }
      : { kind: "failed" };
  }
}

function LoadFailed({ signedOut }: Readonly<{ signedOut: boolean }>) {
  return (
    <div role="alert" className="px-5 py-14 text-center">
      <p className="text-[15px] font-semibold">
        {signedOut ? "Kamu belum masuk sebagai creator." : "Dashboard tidak bisa dimuat."}
      </p>

      <p className="mt-1 text-[13px] text-muted">
        {signedOut
          ? "Masuk dulu untuk melihat ringkasan task kamu."
          : "Coba muat ulang beberapa saat lagi."}
      </p>

      {signedOut ? (
        <a href="/login" className={`mt-4 inline-block ${buttonClasses("accent")}`}>
          Masuk
        </a>
      ) : (
        <a href={BASE_PATH} className={`mt-4 inline-block ${buttonClasses()}`}>
          Muat ulang
        </a>
      )}
    </div>
  );
}

/**
 * The creator dashboard (PBI-7, subtask 7.3): how many tasks wait on the creator, per status,
 * and how close the nearest deadline is. A failed load shows a message, never cards of zeros
 * that would claim there is nothing to do.
 */
export default async function CreatorDashboardPage() {
  const loaded = await load();

  return (
    <AppShell role="creator" title="Dashboard" subtitle="Berikut ringkasan task kamu bulan ini.">
      {loaded.kind === "ok" ? (
        <StatCards
          counts={loaded.dashboard.counts}
          nearestDeadline={nearestDeadlineLabel(loaded.dashboard.nearestDeadline, new Date())}
        />
      ) : (
        <LoadFailed signedOut={loaded.kind === "signed_out"} />
      )}
    </AppShell>
  );
}
