"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreatorLink } from "@/components/ui/creator-link";
import { FIELD, FIELD_ERROR, NUMERIC_INPUT } from "@/components/ui/form-classes";
import { InfoTip } from "@/components/ui/info-tip";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Pill, type Tone } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  DATA_STATE_LABELS,
  METRICS,
  canEnterManually,
  checkManualInput,
  formatMetric,
  stateTip,
  type DataState,
  type LinkPerformance,
  type ManualErrors,
  type ManualFields,
  type ManualValues,
} from "@/lib/link-performance";
import {
  saveManualPerformance,
  syncContentPerformance,
  type ContentPerformanceSyncer,
  type ManualPerformanceSaver,
} from "@/lib/link-performance-api";
import { PLATFORM_LABELS, type ContentLink, type Platform } from "@/lib/platform-links";

const SECTION_LABEL = "mb-2 text-[11px] font-bold uppercase tracking-wider text-muted";

// The state's colour follows the panel's: green once there are numbers to trust, amber where an
// admin can step in, neutral while nothing has happened yet. The label always says it in words.
const STATE_TONES: Record<DataState, Tone> = {
  synced: "green",
  manual: "accent",
  waiting: "neutral",
  not_connected: "amber",
  not_found: "amber",
  sync_failed: "red",
};

/** Why a save did not go through: the API's message, and its per-field messages when it had any. */
interface SaveProblem {
  message: string;
  errors?: ManualErrors;
}

const HELP = 'Angka bulat 0–999.999.999. Isi minimal satu. Kolom kosong tetap "belum ada data", bukan 0.';

/** The link as the card shows it: without the scheme and www, the whole address in the href. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

function fieldsOf(performance: LinkPerformance): ManualFields {
  const text = (value: number | null) => (value === null ? "" : String(value));
  return {
    views: text(performance.views),
    likes: text(performance.likes),
    comments: text(performance.comments),
    shares: text(performance.shares),
  };
}

/** The four numbers, as a description list so each value is read with its name (AC 19). */
function Numbers({ performance }: Readonly<{ performance: LinkPerformance }>) {
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      {METRICS.map(({ name, label }) => (
        <div key={name} className="flex flex-col-reverse">
          <dt className="text-[11px] text-muted">{label}</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-ink">{formatMetric(performance[name])}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * An admin's numbers for one link, typed in the card itself rather than in a modal over the
 * panel (27.5). Checked as the API checks them before anything is asked, then confirmed.
 */
function ManualForm({
  platform,
  performance,
  onCancel,
  onSave,
}: Readonly<{
  platform: Platform;
  performance: LinkPerformance;
  onCancel: () => void;
  onSave: (values: ManualValues) => Promise<SaveProblem | null>;
}>) {
  const id = useId();
  const [fields, setFields] = useState<ManualFields>(() => fieldsOf(performance));
  const [errors, setErrors] = useState<ManualErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [asking, setAsking] = useState<ManualValues | null>(null);
  const [saving, setSaving] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkManualInput(fields);
    setErrors(checked.errors);
    setRefusal(null);
    if (Object.keys(checked.errors).length === 0) setAsking(checked.values);
  }

  async function confirm(values: ManualValues) {
    setAsking(null);
    setSaving(true);
    const problem = await onSave(values);
    setSaving(false);
    if (problem) {
      setErrors(problem.errors ?? {});
      setRefusal(problem.errors ? null : problem.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-3 border-t border-rule pt-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METRICS.map(({ name, label }) => {
          const error = errors[name];
          return (
            <div key={name} className="flex flex-col gap-1 text-[13px]">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-ink">{label}</span>
                <input
                  {...NUMERIC_INPUT}
                  className={FIELD}
                  value={fields[name]}
                  placeholder="Kosongkan kalau belum ada"
                  maxLength={11}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-${name}` : undefined}
                  onChange={(event) => setFields((last) => ({ ...last, [name]: event.target.value }))}
                />
              </label>
              {/* Outside the label, so the message describes the field without renaming it. */}
              {error ? (
                <span id={`${id}-${name}`} className={FIELD_ERROR}>
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">{HELP}</p>
      {errors.metrics ? <p className={FIELD_ERROR}>{errors.metrics}</p> : null}
      {refusal ? (
        <p role="alert" className={FIELD_ERROR}>
          {refusal}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Batal
        </Button>
        <Button type="submit" variant="accent" disabled={saving}>
          Simpan
        </Button>
      </div>
      {asking ? (
        <ConfirmDialog
          title="Simpan Angka Manual?"
          message={`Angka ${PLATFORM_LABELS[platform]} untuk konten ini disimpan sebagai "Diisi manual". Kalau platform nanti mengirim data, angka platform yang dipakai.`}
          confirmLabel="Simpan"
          cancelLabel="Batal"
          confirmVariant="accent"
          onConfirm={() => void confirm(asking)}
          onCancel={() => setAsking(null)}
        />
      ) : null}
    </form>
  );
}

function LinkCard({
  link,
  performance,
  platform,
  role,
  creatorFirstName,
  editing,
  onEdit,
  onCancel,
  onSave,
}: Readonly<{
  link: ContentLink;
  performance: LinkPerformance;
  platform: Platform;
  role: "admin" | "creator";
  creatorFirstName: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: ManualValues) => Promise<SaveProblem | null>;
}>) {
  const label = DATA_STATE_LABELS[performance.state];
  const manual = role === "admin" && canEnterManually(performance.state);

  return (
    <li>
      <div
        role="group"
        aria-label={`Performa ${PLATFORM_LABELS[platform]}`}
        className="rounded-(--radius-panel) border border-rule bg-surface p-3"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          <PlatformIcon platform={platform} />
          <CreatorLink link={link.url} label={shortUrl(link.url)} look="chip" />
          <time dateTime={link.submittedAt} className="text-xs text-muted">
            Dikirim {formatDate(link.submittedAt)}
          </time>
          <span className="ml-auto inline-flex items-center gap-1">
            <Pill tone={STATE_TONES[performance.state]}>{label}</Pill>
            <InfoTip text={stateTip(performance, creatorFirstName)} label={`Tentang ${label}`} align="end" />
          </span>
        </div>
        <Numbers performance={performance} />
        {editing ? (
          <ManualForm platform={platform} performance={performance} onCancel={onCancel} onSave={onSave} />
        ) : manual ? (
          <div className="mt-3 flex justify-end">
            <Button type="button" onClick={onEdit}>
              Isi Manual
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The content's links with their performance (PBI-27, 27.5): one card per link with its four
 * numbers and data state. An admin can sync every link of the content at once and type the
 * numbers in where the platform cannot give them; a creator only reads them (AC 20).
 */
export function LinkPerformanceSection({
  contentId,
  links,
  role,
  creatorFirstName,
  save = saveManualPerformance,
  sync = syncContentPerformance,
  onChanged,
}: Readonly<{
  contentId: string;
  links: readonly ContentLink[];
  role: "admin" | "creator";
  creatorFirstName: string;
  save?: ManualPerformanceSaver;
  sync?: ContentPerformanceSyncer;
  /** Called after the numbers changed, so the panel can read the content again. */
  onChanged?: () => void;
}>) {
  const { show, toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);

  async function syncNow() {
    setSyncing(true);
    const result = await sync(contentId);
    setSyncing(false);
    show(result.ok ? result.toast : result.message);
    if (result.ok) onChanged?.();
  }

  async function saveManual(platform: Platform, values: ManualValues) {
    const result = await save(contentId, platform, values);
    if (!result.ok) return result.errors ? { message: result.message, errors: result.errors } : { message: result.message };
    setEditing(null);
    show("Angka performa disimpan.");
    onChanged?.();
    return null;
  }

  return (
    <section aria-label="Link dan performa">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={`${SECTION_LABEL} mb-0`}>Link &amp; Performa</h3>
        {role === "admin" ? (
          <Button type="button" onClick={() => void syncNow()} disabled={syncing}>
            {syncing ? "Menyinkronkan…" : "Sinkronkan Sekarang"}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {links.map((link) =>
          link.platform && link.performance ? (
            <LinkCard
              key={link.url}
              link={link}
              performance={link.performance}
              platform={link.platform}
              role={role}
              creatorFirstName={creatorFirstName}
              editing={editing === link.platform}
              onEdit={() => setEditing(link.platform)}
              onCancel={() => setEditing(null)}
              onSave={(values) => saveManual(link.platform as Platform, values)}
            />
          ) : (
            // A link kept from before platforms were recorded has nothing to be measured on.
            <li key={link.url} className="flex items-center gap-2 text-[13px]">
              <CreatorLink link={link.url} label={shortUrl(link.url)} look="chip" />
              <time dateTime={link.submittedAt} className="text-xs text-muted">
                {formatDate(link.submittedAt)}
              </time>
            </li>
          ),
        )}
      </ul>
      {toast}
    </section>
  );
}
