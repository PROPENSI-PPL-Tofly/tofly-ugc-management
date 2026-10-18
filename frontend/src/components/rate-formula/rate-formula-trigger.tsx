"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchRateFormula, saveRateFormula } from "@/lib/rate-formula-api";
import {
  draftFromView,
  type RateFormulaDraft,
  type RateFormulaErrors,
  type RateFormulaRequest,
} from "@/lib/rate-formula";
import { RateFormulaModal } from "./rate-formula-modal";

interface SaveFailure {
  message?: string;
  errors: RateFormulaErrors;
}

const NO_FAILURE: SaveFailure = { errors: {} };

/**
 * The "Atur Formula Rate" button of the Rate & Invoicing page and the dialog behind it. The
 * saved formula is read when the button is pressed, so the dialog always opens on what is saved
 * now rather than on what the page loaded with; if it cannot be read the button says so beside
 * itself instead of opening a blank form that would overwrite it.
 */
export function RateFormulaTrigger({
  runningInvoices = 0,
}: Readonly<{
  /** Running invoices a saved change recalculates, said in the dialog before saving. */
  runningInvoices?: number;
}> = {}) {
  const [opened, setOpened] = useState<RateFormulaDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failure, setFailure] = useState<SaveFailure>(NO_FAILURE);
  const { show: confirm, toast } = useToast();

  // Stable, so the modal's discard guard is not rebuilt on every render.
  const close = useCallback(() => {
    setOpened(null);
    setFailure(NO_FAILURE);
  }, []);

  async function open() {
    setLoading(true);
    setLoadFailed(false);
    try {
      setOpened(draftFromView(await fetchRateFormula()));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function save(request: RateFormulaRequest) {
    setSaving(true);
    const result = await saveRateFormula(request);
    setSaving(false);

    if (result.ok) {
      close();
      confirm("Formula rate berhasil disimpan.");
      return;
    }

    // Field messages are shown under their inputs; the general message only when none are.
    const hasFieldErrors = Object.keys(result.errors).length > 0;
    setFailure({ errors: result.errors, message: hasFieldErrors ? undefined : result.message });
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <Button onClick={open} disabled={loading}>
          <span aria-hidden="true">⚙</span> Atur Formula Rate
        </Button>
        {loadFailed ? (
          <p role="alert" className="max-w-[26ch] text-right text-xs text-red-ink">
            Formula rate tidak bisa dimuat. Coba lagi.
          </p>
        ) : null}
      </div>

      {opened ? (
        <RateFormulaModal
          initial={opened}
          onClose={close}
          onSubmit={save}
          loading={saving}
          serverErrors={failure.errors}
          formError={failure.message}
          runningInvoices={runningInvoices}
        />
      ) : null}

      {toast}
    </>
  );
}
