"use client";

import Link from "next/link";
import { useId, useState } from "react";
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

// From lg up a plain table; below it each row stacks into a card, and each cell prints its column
// name from data-label, as Task Saya does.
const HEAD = "px-5 py-3 font-semibold";
const CELL = "px-5 py-3 align-top max-lg:block max-lg:px-0 max-lg:py-1";
const LABELLED =
  "max-lg:flex max-lg:items-start max-lg:gap-2 max-lg:before:w-20 max-lg:before:shrink-0 max-lg:before:text-xs max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";

const COLUMNS = ["Waktu", "Aktor", "Kategori", "Aksi", "Target", "Perubahan"] as const;

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

// The table of "Log Aktivitas" (PBI-23, 23.7), with the rows already filtered and paged.
export function AuditLogTable({ rows }: Readonly<{ rows: AuditLogRow[] }>) {
  return (
    <ScrollFrame>
      {/* Explicit roles: a table whose display changes can lose its semantics in some browsers. */}
      <table role="table" className="w-full text-[13px] max-lg:block">
        <caption className="sr-only">Log aktivitas</caption>
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row" className="border-b border-rule text-left text-muted">
            {COLUMNS.map((column) => (
              <th key={column} role="columnheader" scope="col" className={HEAD}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-lg:flex max-lg:flex-col max-lg:gap-3">
          {rows.map((row) => {
            const actor = auditActorLines(row.actor);
            const targetHref = auditTargetHref(row);
            return (
              <tr
                key={row.id}
                role="row"
                className="border-b border-rule max-lg:block max-lg:rounded-(--radius-panel) max-lg:border max-lg:bg-surface max-lg:px-4 max-lg:py-3"
              >
                <td role="cell" data-label="Waktu" className={`${CELL} ${LABELLED} whitespace-nowrap`}>
                  {auditTimeLabel(row.occurredAt)}
                </td>
                <td role="cell" data-label="Aktor" className={`${CELL} ${LABELLED}`}>
                  <div>
                    <p className="font-semibold">{actor.name}</p>
                    {actor.role ? <p className="text-xs text-muted">{actor.role}</p> : null}
                  </div>
                </td>
                <td role="cell" data-label="Kategori" className={`${CELL} ${LABELLED}`}>
                  <Pill tone={CATEGORY_TONES[row.category]}>{AUDIT_CATEGORY_LABELS[row.category]}</Pill>
                </td>
                <td role="cell" data-label="Aksi" className={`${CELL} ${LABELLED} font-semibold`}>
                  {auditActionLabel(row.action)}
                </td>
                <td role="cell" data-label="Target" className={`${CELL} ${LABELLED} wrap-anywhere`}>
                  {targetHref ? (
                    <Link href={targetHref} className="font-semibold text-accent-deep hover:underline">
                      {row.targetLabel}
                    </Link>
                  ) : (
                    row.targetLabel
                  )}
                </td>
                <td role="cell" data-label="Perubahan" className={`${CELL} ${LABELLED}`}>
                  <ChangeCell row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollFrame>
  );
}
