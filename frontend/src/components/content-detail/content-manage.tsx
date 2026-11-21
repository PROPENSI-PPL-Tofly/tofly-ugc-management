"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FIELD, FIELD_ERROR, REQUIRED_MARK } from "@/components/ui/form-classes";
import { InfoTip } from "@/components/ui/info-tip";
import {
  MAX_BRIEF_LENGTH,
  MAX_NAME_LENGTH,
  checkEdit,
  editBody,
  editChanges,
  editFieldsOf,
  type ContentManagePorts,
  type EditErrors,
  type EditFields,
  type EditableDetail,
  type EditWindow,
} from "@/lib/content-edit";
import { formatDate } from "@/lib/format";

// Ubah and Hapus for scheduled content in the admin's Content Detail panel (PBI-25, 25.2): a pencil
// and a bin in the panel's header, and the edit form that opens in the panel itself rather than in
// a dialog over it.

const ICON_BUTTON =
  "grid size-8 cursor-pointer place-items-center rounded-(--radius-control) border-none bg-transparent text-muted hover:bg-surface-2 hover:text-ink max-sm:size-11";

/** A pencil, drawn in the text colour so it follows the button's hover. */
export function PencilIcon({ className = "size-4" }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function BinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Ubah and Hapus in the panel's header, one press each: a pencil, and a bin in red. */
export function ManageButtons({
  onEdit,
  onDelete,
}: Readonly<{ onEdit: () => void; onDelete: () => void }>) {
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label="Ubah konten" title="Ubah" onClick={onEdit} className={ICON_BUTTON}>
        <PencilIcon />
      </button>
      <button
        type="button"
        aria-label="Hapus konten"
        title="Hapus"
        onClick={onDelete}
        className={`${ICON_BUTTON} hover:text-red-ink`}
      >
        <BinIcon />
      </button>
    </div>
  );
}

type Touched = Partial<Record<keyof EditFields, boolean>>;

/**
 * The edit form, inline in the panel (AC 2-4). It checks what the API checks before anything is
 * asked, confirms with the old and new values, and hands the API's answer back: a 422 lands on
 * its fields, a 409 goes to the panel (`onRefused`), which closes the form and reads the content
 * again since it may no longer change at all.
 */
export function EditForm({
  detail,
  bounds,
  creatorFirstName,
  update,
  onCancel,
  onSaved,
  onRefused,
}: Readonly<{
  detail: EditableDetail;
  bounds: EditWindow;
  creatorFirstName: string;
  update: ContentManagePorts["update"];
  onCancel: () => void;
  onSaved: () => void;
  onRefused: (message: string) => void;
}>) {
  const id = useId();
  const [fields, setFields] = useState<EditFields>(() => editFieldsOf(detail));
  const [touched, setTouched] = useState<Touched>({});
  const [serverErrors, setServerErrors] = useState<EditErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  const checked = checkEdit(fields, detail, bounds);
  const changes = editChanges(fields, detail);
  const specific = detail.type === "specific";
  // The date is judged as soon as it is picked; the text fields once left, so a field is not
  // flagged while it is still being typed. The API's own answer always shows.
  const shown: EditErrors = {
    ...(touched.name && checked.name && { name: checked.name }),
    ...(touched.brief && checked.brief && { brief: checked.brief }),
    ...(checked.deadline && { deadline: checked.deadline }),
    ...serverErrors,
  };
  const canSave = !saving && changes.length > 0 && Object.keys(checked).length === 0;

  function change(field: keyof EditFields, value: string) {
    setFields((last) => ({ ...last, [field]: value }));
    setServerErrors((last) => {
      if (!last[field]) return last;
      const next = { ...last };
      delete next[field];
      return next;
    });
  }

  function leave(field: keyof EditFields) {
    setTouched((last) => ({ ...last, [field]: true }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched({ name: true, brief: true, deadline: true });
    if (canSave) {
      setRefusal(null);
      setAsking(true);
    }
  }

  async function save() {
    setAsking(false);
    setSaving(true);
    const result = await update(detail.id, editBody(fields, detail));
    setSaving(false);
    if (result.ok) {
      onSaved();
    } else if (result.status === 409) {
      onRefused(result.message);
    } else if (Object.keys(result.errors).length > 0) {
      setServerErrors(result.errors);
    } else {
      setRefusal(result.message);
    }
  }

  // The error when there is one, then the counter or the date range; never empty.
  const describedBy = (field: keyof EditFields, extra?: string) =>
    [shown[field] ? `${id}-${field}-error` : null, extra].filter(Boolean).join(" ");

  return (
    <form
      aria-label="Ubah konten"
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-(--radius-panel) border border-rule bg-surface-2 p-3.5"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Ubah konten</p>

      {specific ? (
        <div className="flex flex-col gap-1 text-[13px]">
          <label className="flex flex-col gap-1">
            <span className={`font-semibold text-ink ${REQUIRED_MARK}`}>Nama Konten</span>
            <input
              type="text"
              required
              maxLength={MAX_NAME_LENGTH}
              className={FIELD}
              value={fields.name}
              aria-invalid={shown.name ? true : undefined}
              aria-describedby={describedBy("name", `${id}-name-count`)}
              onChange={(event) => change("name", event.target.value)}
              onBlur={() => leave("name")}
              disabled={saving}
            />
          </label>
          {shown.name ? (
            <span id={`${id}-name-error`} className={FIELD_ERROR}>
              {shown.name}
            </span>
          ) : null}
          <CharLimit id={`${id}-name-count`} length={fields.name.length} max={MAX_NAME_LENGTH} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1 text-[13px]">
        <label className="flex flex-col gap-1">
          {/* Evergreen content may go without a brief, so only Specific marks it required. */}
          <span className={`font-semibold text-ink ${specific ? REQUIRED_MARK : ""}`}>Brief</span>
          <textarea
            required={specific}
            maxLength={MAX_BRIEF_LENGTH}
            rows={4}
            className={`${FIELD} resize-y`}
            value={fields.brief}
            placeholder={specific ? undefined : "Opsional untuk Evergreen"}
            aria-invalid={shown.brief ? true : undefined}
            aria-describedby={describedBy("brief", `${id}-brief-count`)}
            onChange={(event) => change("brief", event.target.value)}
            onBlur={() => leave("brief")}
            disabled={saving}
          />
        </label>
        {shown.brief ? (
          <span id={`${id}-brief-error`} className={FIELD_ERROR}>
            {shown.brief}
          </span>
        ) : null}
        <CharLimit id={`${id}-brief-count`} length={fields.brief.length} max={MAX_BRIEF_LENGTH} />
      </div>

      <div className="relative flex flex-col gap-1 text-[13px]">
        <span className="absolute right-0 top-0">
          <InfoTip
            label="Tentang batas tanggal"
            text="Paling cepat 5 hari dari hari ini (atau dari mulai kontrak, mana yang lebih akhir), paling lambat H-5 sebelum kontrak berakhir."
            align="end"
          />
        </span>
        <label className="flex flex-col gap-1">
          <span className={`font-semibold text-ink ${REQUIRED_MARK}`}>Deadline</span>
          {/* The picker disables every day outside the window (AC 3); the API holds the same line. */}
          <input
            type="date"
            required
            min={bounds.earliestDeadline}
            max={bounds.latestDeadline}
            className={FIELD}
            value={fields.deadline}
            aria-invalid={shown.deadline ? true : undefined}
            aria-describedby={describedBy("deadline", shown.deadline ? undefined : `${id}-deadline-range`)}
            onChange={(event) => change("deadline", event.target.value)}
            disabled={saving}
          />
        </label>
        {shown.deadline ? (
          <span id={`${id}-deadline-error`} className={FIELD_ERROR}>
            {shown.deadline}
          </span>
        ) : (
          <span id={`${id}-deadline-range`} className="text-xs text-muted">
            {formatDate(bounds.earliestDeadline)} – {formatDate(bounds.latestDeadline)}
          </span>
        )}
      </div>

      {refusal ? (
        <p role="alert" className={FIELD_ERROR}>
          {refusal}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Batal
        </Button>
        <Button type="submit" variant="accent" disabled={!canSave} aria-busy={saving}>
          Simpan
        </Button>
      </div>

      {asking ? (
        <ConfirmDialog
          title="Simpan Perubahan Konten?"
          message={`${creatorFirstName} langsung melihat perubahan ini di Tugas Saya.`}
          details={[["Konten", detail.name], ...changes]}
          confirmLabel="Simpan"
          cancelLabel="Batal"
          confirmVariant="accent"
          onConfirm={() => void save()}
          onCancel={() => setAsking(false)}
        />
      ) : null}
    </form>
  );
}
