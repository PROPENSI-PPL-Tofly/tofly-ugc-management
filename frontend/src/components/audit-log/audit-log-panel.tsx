import { Suspense } from "react";
import type { FilterOption } from "@/components/filters/filter-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { LoadError } from "@/components/ui/load-error";
import { Pagination } from "@/components/ui/pagination";
import { Panel, PanelHead } from "@/components/ui/panel";
import {
  AUDIT_LOG_PATH,
  auditLogHref,
  buildAuditLogQuery,
  type AuditLogList,
  type AuditLogState,
} from "@/lib/audit-log";
import { AuditLogFilters, AuditLogFiltersFrom } from "./audit-log-filters";
import { AuditLogTable } from "./audit-log-table";

// The panel of "Log Aktivitas" (PBI-23, 23.7). A null list is a request that failed, which is told
// apart from a list that is empty.
export function AuditLogPanel({
  state,
  list,
  options,
  today,
}: Readonly<{
  state: AuditLogState;
  list: AuditLogList | null;
  // Streamed: reading them scans the whole log, so the table does not wait for them.
  options: Promise<{ actors: FilterOption[]; creators: FilterOption[] }>;
  today: string;
}>) {
  const query = buildAuditLogQuery(state);
  const filtered = Object.keys(buildAuditLogQuery({ ...state, page: 1 })).length > 0;

  return (
    // Not clipped: the filters' popups open past the panel's edge.
    <Panel clip={false}>
      <PanelHead
        title="Semua Aktivitas"
        hint={
          <>
            Hanya bisa ditambah, tidak bisa diubah atau dihapus.{" "}
            <InfoTip
              label="Tentang Log Aktivitas"
              text="Disimpan minimal 1 tahun. Token, kode masuk dan isi file tidak pernah dicatat."
            />
          </>
        }
      />
      <Suspense fallback={<AuditLogFilters actors={[]} creators={[]} today={today} />}>
        <AuditLogFiltersFrom options={options} today={today} />
      </Suspense>

      {list === null ? (
        <LoadError title="Log Aktivitas tidak bisa dimuat." retryHref={auditLogHref(state)} />
      ) : (
        <>
          {list.items.length > 0 ? (
            <AuditLogTable rows={list.items} />
          ) : (
            <EmptyState
              title={filtered ? "Tidak ada aktivitas yang cocok dengan filter." : "Belum ada aktivitas."}
            />
          )}
          <Pagination
            always
            basePath={AUDIT_LOG_PATH}
            noun="aktivitas"
            query={query}
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            totalPages={Math.max(1, list.totalPages)}
          />
        </>
      )}
    </Panel>
  );
}
