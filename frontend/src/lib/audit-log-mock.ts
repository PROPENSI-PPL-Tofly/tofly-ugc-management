// Sample rows for "Log Aktivitas" (23.7) while its API (23.6) does not exist, taken from the Sprint 4
// prototype. Only audit-log.server loads this module, and only in development. Delete both the
// module and that branch once the API is connected.

import {
  AUDIT_LOG_PAGE_SIZE,
  SYSTEM_ACTOR,
  type AuditLogLoaded,
  type AuditLogRow,
  type AuditLogState,
} from "./audit-log";
import { jakartaDay } from "./format";

const RINA = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Rina Wijaya", role: "super_admin" } as const;
const BIMO = { id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Bimo Saputra", role: "admin" } as const;
const SISTEM = { id: null, name: "Sistem", role: "system" } as const;

const SALSA = { id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Salsa Amelia" };
const NADIA = { id: "bbbbbbbb-0000-4000-8000-000000000003", name: "Nadia Putri" };
const RAFI = { id: "bbbbbbbb-0000-4000-8000-000000000004", name: "Rafi Kurniawan" };
const BAGAS = { id: "bbbbbbbb-0000-4000-8000-000000000006", name: "Bagas Santoso" };
const MAYA = { id: "bbbbbbbb-0000-4000-8000-000000000007", name: "Maya Anggraini" };

type Sample = Omit<AuditLogRow, "id" | "occurredAt" | "actor"> & {
  // Jakarta time, as the prototype writes it.
  at: string;
  by: typeof RINA | typeof BIMO | typeof SISTEM;
};

const none = { creator: null, note: null };

const SAMPLES: Sample[] = [
  { ...none, at: "2026-11-15 09:12", by: RINA, category: "pengaturan", action: "buffer_changed", targetType: "buffer", targetLabel: "Buffer Deadline", oldValues: { buffer: "7 hari" }, newValues: { buffer: "5 hari" } },
  { ...none, at: "2026-11-14 16:40", by: BIMO, category: "invoice_pembayaran", action: "invoice_finalized", targetType: "invoice", targetLabel: "Rafi Kurniawan · Periode 1", creator: RAFI, oldValues: { status: "Berjalan" }, newValues: { status: "Invoice Terkirim" } },
  { ...none, at: "2026-11-14 00:05", by: SISTEM, category: "creator_kontrak", action: "creator_changed", targetType: "creator", targetLabel: "Bagas Santoso", creator: BAGAS, oldValues: { akses: "Aktif" }, newValues: { akses: "Ditutup" } },
  { at: "2026-11-08 14:22", by: RINA, category: "creator_kontrak", action: "contract_ended_early", targetType: "contract", targetLabel: "Maya Anggraini", creator: MAYA, oldValues: { berakhir: "15 Des 2026" }, newValues: { berakhir: "10 Nov 2026" }, note: "Pelanggaran Kontrak · Konten diunggah ulang dari creator lain. Invoice: Bayar Sesuai Kontrak." },
  { ...none, at: "2026-11-06 11:30", by: BIMO, category: "creator_kontrak", action: "manual_performance_saved", targetType: "content_link", targetLabel: "Nadia Putri · Hair Care Weekly Routine", creator: NADIA, oldValues: null, newValues: { views: "5.230 views (Instagram)" } },
  { ...none, at: "2026-11-05 09:00", by: RINA, category: "akses_admin", action: "admin_added", targetType: "admin", targetLabel: "Sari Kusuma", oldValues: null, newValues: { role: "Admin" } },
  { ...none, at: "2026-11-04 15:10", by: RINA, category: "akses_admin", action: "admin_deactivated", targetType: "admin", targetLabel: "Sari Kusuma", oldValues: { status: "Aktif" }, newValues: { status: "Nonaktif" } },
  { at: "2026-11-03 13:45", by: BIMO, category: "invoice_pembayaran", action: "invoice_line_corrected", targetType: "invoice", targetLabel: "Nadia Putri · Periode 1", creator: NADIA, oldValues: null, newValues: { penyesuaian: "+Rp100.000" }, note: "Bonus kolaborasi event kampus" },
  { ...none, at: "2026-11-02 10:20", by: RINA, category: "creator_kontrak", action: "creator_changed", targetType: "creator", targetLabel: "Salsa Amelia", creator: SALSA, oldValues: { fixedRate: "Rp4.000.000" }, newValues: { fixedRate: "Rp4.500.000" } },
  // Two fields at once, so the sample shows a row that expands.
  { ...none, at: "2026-10-28 08:55", by: RINA, category: "akses_admin", action: "admin_changed", targetType: "admin", targetLabel: "Dev Tofly", oldValues: { name: "Dev", role: "Admin" }, newValues: { name: "Dev Tofly", role: "Super Admin" } },
  { ...none, at: "2026-10-01 09:00", by: RINA, category: "creator_kontrak", action: "contract_extended", targetType: "contract", targetLabel: "Salsa Amelia", creator: SALSA, oldValues: null, newValues: { periode: "Periode 2 (1 Okt – 31 Des 2026)" } },
  { ...none, at: "2026-09-30 17:00", by: BIMO, category: "invoice_pembayaran", action: "payment_proof_uploaded", targetType: "invoice", targetLabel: "Salsa Amelia · Periode 1", creator: SALSA, oldValues: { status: "Perlu Bukti Bayar" }, newValues: { status: "Bukti Bayar Terkirim" } },
];

// The samples three times over, a quarter apart, so the pagination has pages to show.
const COPIES = 3;
const DAYS_APART = 91;
const DAY_MS = 86_400_000;

interface StoredRow {
  row: AuditLogRow;
  actorId: string;
  day: string;
}

const ROWS: StoredRow[] = Array.from({ length: COPIES }, (_, copy) =>
  SAMPLES.map(({ at, by, ...rest }, index) => {
    const moment = new Date(new Date(`${at.replace(" ", "T")}:00+07:00`).getTime() - copy * DAYS_APART * DAY_MS);
    return {
      row: {
        ...rest,
        id: `sample-${copy}-${index}`,
        occurredAt: moment.toISOString(),
        actor: { name: by.name, role: by.role },
      },
      actorId: by.id ?? SYSTEM_ACTOR,
      day: jakartaDay(moment),
    };
  }),
)
  .flat()
  .sort((a, b) => b.row.occurredAt.localeCompare(a.row.occurredAt));

const ACTORS = [RINA, BIMO].map(({ id, name }) => ({ value: id, label: name }));
const CREATORS = [SALSA, NADIA, RAFI, BAGAS, MAYA].map(({ id, name }) => ({ value: id, label: name }));

function matches({ row, actorId, day }: StoredRow, state: AuditLogState): boolean {
  return (
    (!state.from || day >= state.from) &&
    (!state.to || day <= state.to) &&
    (state.actor.length === 0 || state.actor.includes(actorId)) &&
    (state.category.length === 0 || state.category.includes(row.category)) &&
    (state.action.length === 0 || state.action.includes(row.action)) &&
    (state.creator.length === 0 || (row.creator !== null && state.creator.includes(row.creator.id)))
  );
}

// Answers as the list API will: the filtered rows, newest first, with a page past the end read as
// the last one.
export function mockAuditLog(state: AuditLogState): AuditLogLoaded {
  const found = ROWS.filter((stored) => matches(stored, state));
  const totalPages = Math.ceil(found.length / AUDIT_LOG_PAGE_SIZE);
  const page = Math.min(state.page, Math.max(1, totalPages));
  const start = (page - 1) * AUDIT_LOG_PAGE_SIZE;

  return {
    list: {
      items: found.slice(start, start + AUDIT_LOG_PAGE_SIZE).map(({ row }) => row),
      page,
      pageSize: AUDIT_LOG_PAGE_SIZE,
      total: found.length,
      totalPages,
    },
    actors: [...ACTORS, { value: SYSTEM_ACTOR, label: "Sistem" }],
    creators: CREATORS,
  };
}
