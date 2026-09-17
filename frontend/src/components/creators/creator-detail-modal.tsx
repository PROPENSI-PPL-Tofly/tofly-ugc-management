"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import {
  fetchCreatorDetail,
  type ContentOutcome,
  type ContractStatus,
  type CreatorDetail,
  type Productivity,
} from "@/lib/creators";
import {
  formatContractWindow,
  formatDate,
  formatDaysRemaining,
  formatPercent,
  formatRevisions,
} from "@/lib/format";

const OUTCOME_LABELS: Record<ContentOutcome, string> = {
  on_time: "Tepat waktu",
  submitted_late: "Terlambat kirim",
  late: "Lewat deadline",
  open: "Berjalan",
};

const OUTCOME_TONES: Record<ContentOutcome, Tone> = {
  on_time: "green",
  submitted_late: "amber",
  late: "red",
  open: "neutral",
};

const CONTRACT_LABELS: Record<ContractStatus, string> = {
  active: "Kontrak aktif",
  expired: "Kontrak berakhir",
  upcoming: "Kontrak belum mulai",
  none: "Belum ada kontrak",
};

const CONTRACT_TONES: Record<ContractStatus, Tone> = {
  active: "green",
  expired: "red",
  upcoming: "blue",
  none: "neutral",
};

const PRODUCTIVITY_TONES: Record<Productivity, Tone> = {
  good: "green",
  watch: "amber",
  risk: "red",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-surface-low px-3.5 py-3">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const ROW =
  "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-2 text-[13px] last:border-none";

/**
 * Loads the detail when it opens rather than being handed the data.
 *
 * The table already holds a summary per row; fetching the rest on demand keeps the list
 * response small and means the dialog always shows the current state, not whatever the
 * table was rendered with.
 */
export function CreatorDetailModal({
  creatorId,
  name,
  onClose,
}: {
  creatorId: string;
  name: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchCreatorDetail(creatorId)
      .then((loaded) => {
        if (!cancelled) setDetail(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  return (
    <Modal
      title={name}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant="primary"
            onClick={() => router.push(`/admin/creators/${creatorId}/content-plan`)}
          >
            Lihat content plan
          </Button>
        </>
      }
    >
      {failed ? (
        <p className="py-8 text-center text-[13px] text-red">
          Gagal memuat detail creator. Tutup dialog ini dan coba lagi.
        </p>
      ) : null}

      {!failed && !detail ? (
        <p className="py-8 text-center text-[13px] text-muted">Memuat detail creator…</p>
      ) : null}

      {detail ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <StatusDot tone={CONTRACT_TONES[detail.contract.status]}>
              {CONTRACT_LABELS[detail.contract.status]}
            </StatusDot>
            <span className="text-muted">
              {formatContractWindow(detail.contract.startDate, detail.contract.endDate)}
            </span>
            <span className="text-muted">{formatDaysRemaining(detail.contract.daysRemaining)}</span>
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted">Email</dt>
              <dd>{detail.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted">Telepon</dt>
              <dd>{detail.phoneNumber ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted">Instagram</dt>
              <dd>{detail.socials.instagram ? `@${detail.socials.instagram}` : "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted">TikTok</dt>
              <dd>{detail.socials.tiktok ? `@${detail.socials.tiktok}` : "—"}</dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure
              label="Progress"
              value={`${detail.progress.submitted}/${detail.progress.total}`}
            />
            <Figure label="Tepat waktu" value={formatPercent(detail.performance.onTimeRate)} />
            <Figure label="Rata-rata revisi" value={formatRevisions(detail.performance.avgRevisions)} />
            <Figure
              label="Produktivitas"
              value={
                <Pill tone={PRODUCTIVITY_TONES[detail.performance.productivity]}>
                  {detail.performance.productivityLabel}
                </Pill>
              }
            />
          </div>

          <Section title="Riwayat kontrak">
            <ul>
              {detail.contractHistory.map((period) => (
                <li key={period.id} className={ROW}>
                  <span>
                    Periode {period.periodNumber}
                    {period.isCurrent ? " (berjalan)" : ""}:{" "}
                    {formatContractWindow(period.startDate, period.endDate)}, kuota{" "}
                    {period.contentQuota} konten
                  </span>
                  <span className="text-muted tabular-nums">
                    {period.completed}/{period.total} selesai
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Konten pada kontrak ini">
            {detail.contents.length === 0 ? (
              <p className="text-[13px] text-muted">Belum ada konten pada periode ini.</p>
            ) : (
              <ul>
                {detail.contents.map((content) => (
                  <li key={content.id} className={ROW}>
                    <span>{content.name}</span>
                    <span className="flex items-center gap-3 text-muted">
                      <span className="tabular-nums">{formatDate(content.deadline)}</span>
                      <Pill tone={OUTCOME_TONES[content.outcome]}>
                        {OUTCOME_LABELS[content.outcome]}
                      </Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Draft yang dikirim">
            {detail.drafts.length === 0 ? (
              <p className="text-[13px] text-muted">Belum ada draft yang dikirim.</p>
            ) : (
              <ul>
                {detail.drafts.map((draft) => (
                  <li key={draft.contentId} className={ROW}>
                    <span>{draft.contentName}</span>
                    <span className="text-muted tabular-nums">
                      {formatRevisions(draft.revisionCount)} revisi, terakhir{" "}
                      {formatDate(draft.lastSubmittedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : null}
    </Modal>
  );
}
