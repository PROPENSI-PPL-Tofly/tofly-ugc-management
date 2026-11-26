"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { Pill, type Tone } from "@/components/ui/pill";
import { ScrollFrame } from "@/components/ui/scroll-frame";
import {
  AUDIT_CATEGORY_LABELS,
  auditActionLabel,
  auditActorLines,
  auditChangeShown,
  auditChangeView,
  auditTargetHref,
  auditTimeLabel,
  type AuditCategory,
  type AuditChange,
  type AuditLogRow,
} from "@/lib/audit-log";
import { EMPTY } from "@/lib/format";

// From lg up a plain table; below it a list of cards, each naming every column. Two layouts
// instead of one table restyled as cards, so neither needs a role written over its own (Sonar
// S6843 on #232): a table whose display changes loses its semantics in some browsers.
const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top";

const CATEGORY_TONES: Record<AuditCategory, Tone> = {
  akses_admin: "accent",
  creator_kontrak: "neutral",
  invoice_pembayaran: "amber",
  pengaturan: "green",
};

function NamedChange({ change }: Readonly<{ change: AuditChange }>) {
  const { label, from, to } = auditChangeShown(change);
  return (
    <>
      {label}: <span className="text-muted">{from}</span> → <b>{to}</b>
    </>
  );
}

// SCRUM-297: several changed fields stay behind a toggle, so one entry cannot stretch the table.
function ExpandableChanges({ changes }: Readonly<{ changes: AuditChange[] }>) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((was) => !was)}
        className="cursor-pointer border-none bg-transparent p-0 font-semibold text-accent-deep"
      >
        {changes.length} perubahan
        <span aria-hidden="true" className={`ml-1.5 inline-block text-[11px] transition-transform ${open ? "rotate-90" : ""}`}>
          ▸
        </span>
      </button>
      {open ? (
        <ul id={listId} className="mt-1.5 flex flex-col gap-1">
          {changes.map((change) => (
            <li key={change.field} className="wrap-anywhere">
              <NamedChange change={change} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChangeCell({ row }: Readonly<{ row: AuditLogRow }>) {
  const view = auditChangeView(row.oldValues, row.newValues);

  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 wrap-anywhere">
        {view.kind === "none" ? EMPTY : null}
        {view.kind === "single" ? <NamedChange change={view.change} /> : null}
        {view.kind === "expandable" ? <ExpandableChanges changes={view.changes} /> : null}
      </div>
      {row.note ? <InfoTip text={row.note} label="Catatan" align="end" /> : null}
    </div>
  );
}

function ActorCell({ row }: Readonly<{ row: AuditLogRow }>) {
  const actor = auditActorLines(row.actor);
  return (
    <div>
      <p className="font-semibold">{actor.name}</p>
      {actor.role ? <p className="text-xs text-muted">{actor.role}</p> : null}
    </div>
  );
}

function TargetCell({ row }: Readonly<{ row: AuditLogRow }>) {
  const targetHref = auditTargetHref(row);
  return targetHref ? (
    <Link href={targetHref} className="font-semibold text-accent-deep hover:underline">
      {row.targetLabel}
    </Link>
  ) : (
    row.targetLabel
  );
}

interface Column {
  label: string;
  className: string;
  show(row: AuditLogRow): ReactNode;
}

// Each column once, in the Sprint 4 prototype's order, for the table and the cards alike.
const COLUMNS: readonly Column[] = [
  { label: "Waktu", className: "whitespace-nowrap", show: (row) => auditTimeLabel(row.occurredAt) },
  { label: "Aktor", className: "", show: (row) => <ActorCell row={row} /> },
  {
    label: "Kategori",
    className: "",
    show: (row) => <Pill tone={CATEGORY_TONES[row.category]}>{AUDIT_CATEGORY_LABELS[row.category]}</Pill>,
  },
  { label: "Aksi", className: "font-semibold", show: (row) => auditActionLabel(row.action) },
  { label: "Target", className: "wrap-anywhere", show: (row) => <TargetCell row={row} /> },
  { label: "Perubahan", className: "", show: (row) => <ChangeCell row={row} /> },
];

// The table of "Log Aktivitas" (PBI-23, 23.7), with the rows already filtered and paged.
export function AuditLogTable({ rows }: Readonly<{ rows: AuditLogRow[] }>) {
  return (
    <>
      <div className="max-lg:hidden">
        <ScrollFrame>
          <table className="w-full text-[13px]">
            <caption className="sr-only">Log aktivitas</caption>
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                {COLUMNS.map((column) => (
                  <th key={column.label} scope="col" className={HEAD}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-rule">
                  {COLUMNS.map((column) => (
                    <td key={column.label} className={`${CELL} ${column.className}`}>
                      {column.show(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollFrame>
      </div>
      <ul aria-label="Log aktivitas" className="flex flex-col gap-3 text-[13px] lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-(--radius-panel) border border-rule bg-surface px-4 py-3">
            <dl className="flex flex-col gap-2">
              {COLUMNS.map((column) => (
                <div key={column.label} className="flex items-start gap-2">
                  <dt className="w-20 shrink-0 text-xs text-muted">{column.label}</dt>
                  <dd className={`min-w-0 ${column.className}`}>{column.show(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
