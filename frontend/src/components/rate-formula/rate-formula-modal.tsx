"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import {
  BONUS_PLATFORMS,
  isRateFormulaDirty,
  MAX_TIERS,
  platformErrorKey,
  toRateFormulaRequest,
  validateRateFormula,
  type BonusPlatform,
  type PlatformDraft,
  type RateFormulaDraft,
  type RateFormulaErrors,
  type RateFormulaRequest,
} from "@/lib/rate-formula";
import { AmountField } from "./amount-field";
import { PlatformBonusCard } from "./platform-bonus-card";

const ALERT =
  "rounded-(--radius-control) border border-red-wash bg-red-wash px-3 py-2 text-[13px] text-red-ink";

const NO_ERRORS: RateFormulaErrors = {};

type AmountKey = "latePenaltyPerDay" | "maxPenaltyDays" | "specificBonus";

/**
 * The Atur Formula Rate dialog: the daily late penalty and its cap, the Specific bonus, and the
 * performance bonus tiers per platform. It opens on `initial` (what is saved, or a blank form),
 * checks every field as it is typed, and hands a request to `onSubmit` only once all of them hold.
 */
export function RateFormulaModal({
  initial,
  onClose,
  onSubmit,
  loading = false,
  serverErrors = NO_ERRORS,
  formError,
  runningInvoices = 0,
}: {
  initial: RateFormulaDraft;
  onClose: () => void;
  onSubmit: (request: RateFormulaRequest) => void;
  loading?: boolean;
  /** The server's message per field from the last rejected save. */
  serverErrors?: RateFormulaErrors;
  /** A save failure that belongs to no single field. */
  formError?: string;
  /** Running invoices a saved change recalculates at once. */
  runningInvoices?: number;
}) {
  const [draft, setDraft] = useState(initial);
  // Which messages the admin has earned: a field shows its error once it was left (or, for a
  // platform's tiers, changed), otherwise the whole form would flash red the instant it opens.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Keys edited since the server last answered: its message no longer describes the input.
  const [answered, setAnswered] = useState(serverErrors);
  const [edited, setEdited] = useState<Record<string, boolean>>({});
  if (answered !== serverErrors) {
    setAnswered(serverErrors);
    setEdited({});
  }

  // The one place validation runs: it decides Simpan's state and every message below.
  const liveErrors = validateRateFormula(draft);
  const isValid = Object.keys(liveErrors).length === 0;

  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: isRateFormulaDirty(draft, initial),
    onDiscard: onClose,
    title: "Batalkan perubahan formula?",
  });

  function touch(key: string) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function edit(key: string) {
    setEdited((prev) => ({ ...prev, [key]: true }));
  }

  function shownError(key: string): string | undefined {
    const live = touched[key] ? liveErrors[key] : undefined;
    return live ?? (edited[key] ? undefined : serverErrors[key]);
  }

  function changeAmount(key: AmountKey, value: number | null) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    edit(key);
  }

  function changePlatform(platform: BonusPlatform, next: PlatformDraft) {
    setDraft((prev) => ({
      ...prev,
      performanceBonus: { ...prev.performanceBonus, [platform]: next },
    }));
    const key = platformErrorKey(platform);
    edit(key);
    touch(key);
  }

  function amountProps(key: AmountKey) {
    return {
      value: draft[key],
      error: shownError(key),
      onChange: (value: number | null) => changeAmount(key, value),
      onBlur: () => touch(key),
    };
  }

  return (
    <>
      <Modal
        title="Atur Formula Rate"
        onClose={requestClose}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose}>
              Batal
            </Button>
            <Button
              variant="accent"
              onClick={() => onSubmit(toRateFormulaRequest(draft))}
              disabled={loading || !isValid}
            >
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-3">
          <AmountField
            label="Penalti per Hari (Rp)"
            hint="Per konten Evergreen yang telat."
            {...amountProps("latePenaltyPerDay")}
          />
          <AmountField
            label="Maks Hari Penalti"
            hint="Penalti per konten berhenti di hari ini. Contoh: Rp15.000 × maks 3 hari = Rp45.000."
            {...amountProps("maxPenaltyDays")}
          />
          <AmountField
            label="Bonus Specific (Rp)"
            hint="Per konten Specific yang selesai tepat waktu."
            tipAlign="end"
            {...amountProps("specificBonus")}
          />
        </div>

        <div className="mt-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted">
          Bonus Performa
          <InfoTip
            label="Info Bonus Performa"
            text={`Berlaku untuk semua creator, diatur per platform. Dipakai tier tertinggi yang tercapai. Maks ${MAX_TIERS} tier.`}
          />
        </div>

        {BONUS_PLATFORMS.map((platform) => (
          <PlatformBonusCard
            key={platform}
            platform={platform}
            value={draft.performanceBonus[platform]}
            error={shownError(platformErrorKey(platform))}
            onChange={(next) => changePlatform(platform, next)}
          />
        ))}

        {runningInvoices > 0 ? (
          <p
            role="note"
            className="rounded-(--radius-control) border border-amber bg-amber-wash px-3 py-2 text-[13px] text-amber-ink"
          >
            {`Perubahan langsung menghitung ulang ${runningInvoices} invoice yang masih berjalan.`}
          </p>
        ) : null}

        {formError ? (
          <p role="alert" className={ALERT}>
            {formError}
          </p>
        ) : null}
      </Modal>
      {confirmDialog}
    </>
  );
}
