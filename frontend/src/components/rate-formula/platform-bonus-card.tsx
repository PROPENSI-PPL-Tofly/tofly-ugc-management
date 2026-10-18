"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/amount-input";
import { FIELD, FIELD_ERROR } from "@/components/ui/form-classes";
import {
  addTier,
  changeMetric,
  MAX_TIERS,
  METRIC_LABELS,
  PERFORMANCE_METRICS,
  PLATFORM_LABELS,
  removeTier,
  updateTier,
  type BonusPlatform,
  type PerformanceMetric,
  type PlatformDraft,
} from "@/lib/rate-formula";

/**
 * One platform's performance bonus: the metric its tiers count and the tiers themselves, each a
 * minimum and the bonus paid once it is reached. Holds no state of its own; the modal owns the
 * draft and hears every change through `onChange`.
 */
export function PlatformBonusCard({
  platform,
  value,
  error,
  onChange,
}: {
  platform: BonusPlatform;
  value: PlatformDraft;
  /** What is wrong with this platform's tiers, shown under the rows. */
  error?: string;
  onChange: (next: PlatformDraft) => void;
}) {
  const metricId = useId();
  const errorId = useId();
  const platformName = PLATFORM_LABELS[platform];
  const metricName = METRIC_LABELS[value.metric];
  const atLimit = value.tiers.length >= MAX_TIERS;

  return (
    <div role="group" aria-label={`Bonus performa ${platformName}`} className="rounded-(--radius-panel) border border-rule p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">{platformName}</h3>
        <label htmlFor={metricId} className="flex items-center gap-2 rounded-full border border-rule px-3 py-1 text-[13px] text-muted">
          Metrik
          <select
            id={metricId}
            className="cursor-pointer bg-transparent font-semibold text-ink focus:outline-none"
            value={value.metric}
            onChange={(event) => onChange(changeMetric(event.target.value as PerformanceMetric))}
          >
            {PERFORMANCE_METRICS.map((metric) => (
              <option key={metric} value={metric}>
                {METRIC_LABELS[metric]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-x-2 gap-y-2">
        <span className="text-xs font-semibold text-muted">Minimum {metricName}</span>
        <span className="text-xs font-semibold text-muted">Bonus (Rp)</span>
        <span aria-hidden="true" />

        {value.tiers.map((tier, index) => (
          // Tiers have no identity beyond their place in the list, and removing one shifts the rest.
          <TierRow
            key={index}
            index={index}
            platformName={platformName}
            metricName={metricName}
            threshold={tier.threshold}
            bonus={tier.bonus}
            errorId={error ? errorId : undefined}
            invalid={error !== undefined}
            onThreshold={(threshold) =>
              onChange({ ...value, tiers: updateTier(value.tiers, index, { threshold }) })
            }
            onBonus={(bonus) =>
              onChange({ ...value, tiers: updateTier(value.tiers, index, { bonus }) })
            }
            onRemove={() => onChange({ ...value, tiers: removeTier(value.tiers, index) })}
          />
        ))}
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-3">
        {error ? (
          <p id={errorId} className={FIELD_ERROR}>
            {error}
          </p>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {value.tiers.length}/{MAX_TIERS} tier
        </span>
      </div>

      <Button
        variant="ghost"
        className="mt-1 px-0"
        disabled={atLimit}
        onClick={() => onChange({ ...value, tiers: addTier(value.tiers) })}
      >
        + Tambah Tier
      </Button>
    </div>
  );
}

function TierRow({
  index,
  platformName,
  metricName,
  threshold,
  bonus,
  errorId,
  invalid,
  onThreshold,
  onBonus,
  onRemove,
}: {
  index: number;
  platformName: string;
  metricName: string;
  threshold: number | null;
  bonus: number | null;
  errorId?: string;
  invalid: boolean;
  onThreshold: (value: number | null) => void;
  onBonus: (value: number | null) => void;
  onRemove: () => void;
}) {
  const position = `${platformName} tier ${index + 1}`;

  return (
    <>
      <AmountInput
        className={FIELD}
        aria-label={`${position} minimum ${metricName}`}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={errorId}
        value={threshold}
        onChange={onThreshold}
      />
      <AmountInput
        className={FIELD}
        aria-label={`${position} bonus (Rp)`}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={errorId}
        value={bonus}
        onChange={onBonus}
      />
      <button
        type="button"
        aria-label={`Hapus ${position}`}
        onClick={onRemove}
        className="cursor-pointer rounded-(--radius-control) px-2 text-lg leading-none text-muted hover:text-ink"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </>
  );
}
