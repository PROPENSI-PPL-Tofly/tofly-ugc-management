import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatorContentBoard } from "@/components/creator-detail/creator-content-board";
import { CreatorProfilePanel } from "@/components/creator-detail/creator-profile";
import { EditCreatorTrigger } from "@/components/creator-detail/edit-creator-trigger";
import { EndContractEarlyTrigger } from "@/components/creator-detail/end-contract-early-trigger";
import { ExtendContractTrigger } from "@/components/creator-detail/extend-contract-trigger";
import { UpcomingPeriodActions } from "@/components/creator-detail/upcoming-period-actions";
import { PeriodSummary, PeriodTabs } from "@/components/creator-detail/period-tabs";
import { AppShell } from "@/components/shell/app-shell";
import { LoadError } from "@/components/ui/load-error";
import { Panel } from "@/components/ui/panel";
import { MIN_TARGET, PHONE_TARGET } from "@/components/ui/touch-target";
import {
  creatorDatabaseHref,
  creatorDetailHref,
  parseCreatorDetailParams,
  type CreatorDetailView,
} from "@/lib/creator-detail";
import { jakartaDay } from "@/lib/format";
import { fetchCreatorDetail } from "@/lib/creator-detail.server";

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
  const today = jakartaDay();

  return (
    <AppShell
      title="Detail Creator"
    >
      <Link
        href={creatorDatabaseHref(state.back)}
        className={`mb-4 inline-flex items-center text-[13px] font-semibold text-muted hover:text-ink ${MIN_TARGET} ${PHONE_TARGET}`}
      >
        ← Kembali ke Kreator
      </Link>

      {view ? (
        <div className="flex flex-col gap-4">
          {/* The profile describes the creator's current contract, whichever period is open. */}
          <CreatorProfilePanel
            creator={view.creator}
            current={view.current}
            today={today}
            connections={view.connections}
            // PBI-16: changes the creator and the terms of the period that is open.
            action={
              <EditCreatorTrigger
                creator={view.creator}
                period={view.selected}
                periods={view.periods}
                usernameLocks={view.usernameLocks}
              />
            }
          />
          <PeriodTabs
            creatorId={id}
            periods={view.periods}
            selected={view.selected}
            back={state.back}
            action={
              <>
                {/* At most one shows: a renewal still to start is changed, otherwise one is added. */}
                <UpcomingPeriodActions creatorId={id} creatorName={view.creator.name} periods={view.periods} />
                {/* PBI-37: only while a period runs and was not ended early; before the renewal, as the prototype orders them. */}
                <EndContractEarlyTrigger creatorId={id} creatorName={view.creator.name} periods={view.periods} />
                <ExtendContractTrigger creatorId={id} creatorName={view.creator.name} periods={view.periods} />
              </>
            }
          />
          {view.selected ? (
            <PeriodSummary period={view.selected} earnings={view.earnings} creatorName={view.creator.name} />
          ) : null}
          <CreatorContentBoard creatorId={id} view={view} state={state} today={today} />
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
