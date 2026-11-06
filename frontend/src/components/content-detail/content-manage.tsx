"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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

// Ubah and Hapus for scheduled content in the admin's Content Detail panel (PBI-25, 25.2): the
// "⋯" menu in the panel's header that offers them, and the edit form that opens in the panel
// itself rather than in a dialog over it.

const MENU_ITEM =
  "block w-full cursor-pointer whitespace-nowrap border-none bg-transparent px-3 py-2 text-left text-[13px] hover:bg-surface-2 focus:bg-surface-2 focus:outline-none";

/**
 * The header's "⋯": Ubah and Hapus behind one button, as the prototype draws them. Escape and a
 * press elsewhere close the menu; Escape is kept from the panel, which would otherwise close too.
 */
export function ManageMenu({
  onEdit,
  onDelete,
}: Readonly<{ onEdit: () => void; onDelete: () => void }>) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Focus moves into the menu as it opens, so arrows and Escape work at once.
  useEffect(() => {
    if (open) firstItem.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // On the toggle and on the menu itself, both real controls, rather than on a plain wrapper.
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = Array.from(
        wrapper.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  }

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-label="Aksi lain"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={onKeyDown}
        className="grid size-8 cursor-pointer place-items-center rounded-(--radius-control) border-none bg-transparent text-lg leading-none text-muted hover:bg-surface-2 hover:text-ink max-sm:size-11"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Aksi konten"
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-10 mt-1 min-w-36 overflow-hidden rounded-(--radius-control) border border-rule bg-surface py-1 shadow-whisper"
        >
          <button
            ref={firstItem}
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={() => choose(onEdit)}
          >
            Ubah
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${MENU_ITEM} text-red-ink`}
            onClick={() => choose(onDelete)}
          >
            Hapus
          </button>
        </div>
      ) : null}
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
          message={`${creatorFirstName} langsung melihat perubahan ini di Task Saya.`}
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
