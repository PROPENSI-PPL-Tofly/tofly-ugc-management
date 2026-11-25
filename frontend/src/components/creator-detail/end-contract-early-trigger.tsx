"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { CreatorPeriod } from "@/lib/creator-detail";
import { endablePeriod, upcomingPeriodsOf } from "@/lib/early-end";
import { formatDate } from "@/lib/format";
import { EndContractEarlyModal } from "./end-contract-early-modal";

/**
 * "Akhiri Kontrak Lebih Awal" on Creator Detail's Periode Kontrak panel (PBI-37 AC 1): offered
 * only while a period runs and has not been ended early. Once the end is saved the form closes,
 * a toast confirms it (AC 5) and the page is read again, so the period shows its new end.
 */
export function EndContractEarlyTrigger({
  creatorId,
  creatorName,
  periods,
}: Readonly<{
  creatorId: string;
  creatorName: string;
  /** Newest first, as the page's view carries them. */
  periods: readonly CreatorPeriod[];
}>) {
  const router = useRouter();
  const { show: notify, toast } = useToast();
  const [open, setOpen] = useState(false);

  const period = endablePeriod(periods);
  if (period === null) return toast;

  return (
    <>
      <Button variant="danger-outline" onClick={() => setOpen(true)}>
        Akhiri Kontrak Lebih Awal
      </Button>

      {open ? (
        <EndContractEarlyModal
          creatorId={creatorId}
          creatorName={creatorName}
          period={period}
          upcoming={upcomingPeriodsOf(periods)}
          onClose={() => setOpen(false)}
          onEnded={(plan) => {
            setOpen(false);
            notify(`Kontrak ${creatorName} diakhiri per ${formatDate(plan.lastDay)}.`);
            router.refresh();
          }}
        />
      ) : null}

      {toast}
    </>
  );
}
