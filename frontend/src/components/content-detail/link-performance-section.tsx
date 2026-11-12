"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreatorLink } from "@/components/ui/creator-link";
import { FIELD, FIELD_ERROR } from "@/components/ui/form-classes";
import { GroupedNumberInput } from "@/components/ui/grouped-number-input";
import { groupDigits } from "@/lib/grouped-number";
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
  syncLinkPerformance,
  type ContentPerformanceSyncer,
  type LinkPerformanceSyncer,
  type ManualPerformanceSaver,
} from "@/lib/link-performance-api";
import { PLATFORM_LABELS, PLATFORMS, type ContentLink, type Platform } from "@/lib/platform-links";
import { PencilIcon } from "./content-manage";

const ICON_BUTTON =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-(--radius-control) border-none bg-transparent text-muted hover:bg-surface-2 hover:text-ink max-sm:size-11";

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

/** The link as the card shows it: without the scheme and www, the whole address in the href. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

function fieldsOf(performance: LinkPerformance): ManualFields {
  const text = (value: number | null) => (value === null ? "" : groupDigits(String(value)));
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
                <GroupedNumberInput
                  className={FIELD}
                  value={fields[name]}
                  // An empty field is saved as no data, never as 0.
                  placeholder="Belum ada angka"
                  // 999.999.999 with its dots, and room to show a number past it so it is refused.
                  maxLength={15}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-${name}` : undefined}
                  onChange={(shown) => setFields((last) => ({ ...last, [name]: shown }))}
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

// SCRUM-282: two arrows round a circle, drawn inline as the platform marks are; the button
// around it carries the name, so the drawing says nothing to a screen reader.
function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M20 12a8 8 0 0 1-14.3 4.9" />
      <path d="M4 12A8 8 0 0 1 18.3 7.1" />
      <path d="M18.5 3v4.2h-4.2" />
      <path d="M5.5 21v-4.2h4.2" />
    </svg>
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
  onSync,
  syncDisabled,
  onEditLink,
  linkForm,
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
  /** SCRUM-282: syncs only this card's link. */
  onSync: () => void;
  /** True while any sync of this content runs, so a second one is never started. */
  syncDisabled: boolean;
  /** The creator's pencil: changes this link. Absent for an admin, who never changes a link. */
  onEditLink?: () => void;
  /** This link's form, open in place of the link while the creator changes it. */
  linkForm?: ReactNode;
}>) {
  const label = DATA_STATE_LABELS[performance.state];
  const syncName = `Sinkronkan ${PLATFORM_LABELS[platform]}`;
  const manual = role === "admin" && canEnterManually(performance.state);

  return (
    <li>
      <div
        role="group"
        aria-label={`Performa ${PLATFORM_LABELS[platform]}`}
        className="rounded-(--radius-panel) border border-rule bg-surface p-3"
      >
        {/* The link fills its own line, so every card's link is one length whatever its
            address; the hand-in day and the state share the line under it. */}
        {linkForm ?? (
          <div data-link-row="" className="flex items-center gap-2 text-[13px]">
            <PlatformIcon platform={platform} />
            <div className="min-w-0 flex-1">
              <CreatorLink link={link.url} label={shortUrl(link.url)} look="field" />
            </div>
            {onEditLink ? (
              <button
                type="button"
                aria-label={`Ubah link ${PLATFORM_LABELS[platform]}`}
                title="Ubah link"
                onClick={onEditLink}
                className={ICON_BUTTON}
              >
                <PencilIcon />
              </button>
            ) : null}
          </div>
        )}
        <div className="mb-3 mt-2 flex items-center gap-2">
          <time dateTime={link.submittedAt} className="text-xs text-muted">
            Dikirim {formatDate(link.submittedAt)}
          </time>
          <span className="ml-auto inline-flex items-center gap-1">
            {role === "admin" ? (
              <Button
                type="button"
                variant="ghost"
                className="px-1.5 max-sm:min-w-11"
                aria-label={syncName}
                title={syncName}
                onClick={onSync}
                disabled={syncDisabled}
              >
                <RefreshIcon />
              </Button>
            ) : null}
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
  syncLink = syncLinkPerformance,
  onChanged,
  editingLink = null,
  onEditLink = () => undefined,
  renderLinkForm,
}: Readonly<{
  contentId: string;
  links: readonly ContentLink[];
  role: "admin" | "creator";
  creatorFirstName: string;
  save?: ManualPerformanceSaver;
  sync?: ContentPerformanceSyncer;
  /** SCRUM-282: one card's Refresh. */
  syncLink?: LinkPerformanceSyncer;
  /** Called after the numbers changed, so the panel can read the content again. */
  onChanged?: () => void;
  /** The platform whose link the creator is changing or adding, with its form open. */
  editingLink?: Platform | null;
  /** Opens a platform's link form: the creator's pencil and +. Absent, no link can be changed. */
  onEditLink?: (platform: Platform) => void;
  /** The form for one platform's link, drawn by the panel, which holds what it sends. */
  renderLinkForm?: (platform: Platform) => ReactNode;
}>) {
  const { show, toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  // Only the creator adds or changes a link; an admin gets neither the pencil nor the +.
  const linksChangeable = role === "creator" && onEditLink !== undefined && renderLinkForm !== undefined;
  const linked = new Set(links.map((link) => link.platform));
  const missing = PLATFORMS.filter((platform) => !linked.has(platform));
  const [editing, setEditing] = useState<Platform | null>(null);
  // SCRUM-282: the link a card's Refresh is syncing; while any sync runs, no button starts another.
  const [syncingLink, setSyncingLink] = useState<Platform | null>(null);
  const busy = syncing || syncingLink !== null;

  async function syncNow() {
    setSyncing(true);
    const result = await sync(contentId);
    setSyncing(false);
    show(result.ok ? result.toast : result.message);
    if (result.ok) onChanged?.();
  }

  async function syncOne(platform: Platform) {
    setSyncingLink(platform);
    const result = await syncLink(contentId, platform);
    setSyncingLink(null);
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
          <Button type="button" onClick={() => void syncNow()} disabled={busy}>
            {syncing ? "Menyinkronkan…" : "Sinkronkan Sekarang"}
          </Button>
        ) : null}
      </div>
      {/* PBI-28 AC 13: the creator's own bonus, so only a creator is reminded. */}
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
              onSync={() => void syncOne(link.platform as Platform)}
              syncDisabled={busy}
              onEditLink={linksChangeable ? () => onEditLink(link.platform as Platform) : undefined}
              linkForm={
                linksChangeable && editingLink === link.platform ? renderLinkForm(link.platform) : undefined
              }
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
      {/* A platform with no link yet: the creator adds it from here, its form in the +'s place. */}
      {linksChangeable && missing.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {missing.map((platform) =>
            editingLink === platform ? (
              <li key={platform} className="rounded-(--radius-panel) border border-rule bg-surface p-3">
                {renderLinkForm(platform)}
              </li>
            ) : (
              <li key={platform}>
                <button
                  type="button"
                  aria-label={`Tambah link ${PLATFORM_LABELS[platform]}`}
                  onClick={() => onEditLink(platform)}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-(--radius-panel) border border-dashed border-rule bg-transparent px-3 py-2.5 text-[13px] font-semibold text-muted hover:border-ink-2 hover:text-ink"
                >
                  <span aria-hidden="true" className="text-base leading-none">+</span>
                  <PlatformIcon platform={platform} />
                  Tambah link {PLATFORM_LABELS[platform]}
                </button>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {toast}
    </section>
  );
}
