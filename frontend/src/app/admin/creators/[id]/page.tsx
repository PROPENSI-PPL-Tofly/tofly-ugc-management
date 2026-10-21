import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatorContentBoard } from "@/components/creator-detail/creator-content-board";
import { CreatorProfilePanel } from "@/components/creator-detail/creator-profile";
import { PeriodTabs } from "@/components/creator-detail/period-tabs";
import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import { Panel } from "@/components/ui/panel";
import {
  creatorDetailHref,
  parseCreatorDetailParams,
  type CreatorDetailView,
} from "@/lib/creator-detail";
import { fetchCreatorDetail } from "@/lib/creator-detail.server";
import { jakartaDay } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Detail Creator — Tofly",
};

/**
 * One creator on one page (PBI-4): who they are, their contract history period by period, and
 * the content of the period that is open. It takes the place of the Creator Detail modal and
 * the per-creator Content Plan page.
 *
 * Fetched on the server so the first paint already has the data and the backend address stays
 * out of the browser. The URL is the only state: the open period, the filters and the page
 * number come in as search params, which keeps a view linkable and reload-safe. Until the
 * detail arrives, the page offers a retry rather than panels it cannot fill.
 */
export default async function CreatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const state = parseCreatorDetailParams(await searchParams);

  let view: CreatorDetailView | null | undefined;
  try {
    view = await fetchCreatorDetail(id, state);
  } catch {
    // A request that failed is not a creator that is gone: this one is offered again.
    view = undefined;
  }

  // Outside the try, so the not-found signal is never mistaken for a failed request.
  if (view === null) notFound();

  return (
    <AppShell
      title="Detail Creator"
      subtitle="Data, jadwal, dan content plan satu creator"
    >
      <Link
        href="/admin/creators"
        className="mb-4 inline-block text-[13px] font-semibold text-muted hover:text-ink"
      >
        ← Kembali ke Creator Database
      </Link>

      {view ? (
        <div className="flex flex-col gap-4">
          {/* The profile describes the creator's latest contract, whichever period is open. */}
          <CreatorProfilePanel
            creator={view.creator}
            current={view.periods[0] ?? null}
            today={jakartaDay()}
          />
          <PeriodTabs creatorId={id} periods={view.periods} selected={view.selected} />
          <CreatorContentBoard creatorId={id} view={view} state={state} />
        </div>
      ) : (
        <Panel>
          <LoadError
            title="Detail creator tidak bisa dimuat."
            retryHref={creatorDetailHref(id, state)}
          />
        </Panel>
      )}
    </AppShell>
  );
}
