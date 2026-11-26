"use client";

import { ScrollFrame } from "@/components/ui/scroll-frame";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { FilteredEmpty } from "@/components/filters/filter-controls";
import { buttonClasses } from "@/components/ui/button-classes";
import { useUrlQuery } from "@/lib/url-query";
import { formatJakartaDay, formatTimestamp } from "@/lib/format";
import {
  ADMIN_USERS_PATH,
  ROLE_LABELS,
  STATUS_LABELS,
  adminUserDisplayName,
  adminUserStatus,
  type AdminRole,
  type AdminStatus,
  type AdminUser,
} from "@/lib/admin-users";
import Link from "next/link";

const HEAD = "border-b border-rule px-5 pb-2 pt-3 text-left text-xs font-semibold text-muted";
const CELL = "border-b border-rule-2 px-5 py-3 align-top text-[13px]";

const ROLE_TONES: Record<AdminRole, Tone> = {
  super_admin: "accent",
  admin: "neutral",
};

const STATUS_TONES: Record<AdminStatus, Tone> = {
  active: "green",
  inactive: "neutral",
};

const COLUMNS = ["Nama", "Email", "Peran", "Status", "Terakhir masuk", "Ditambahkan"];

const LINK_BUTTON = `inline-flex items-center ${buttonClasses()}`;

/**
 * Why the table is empty. Three situations, three next steps: nobody has been added, the search
 * matched nobody, or the page number is past the end.
 */
function EmptyRoster({
  total,
  filtered,
  onReset,
}: {
  total: number;
  filtered: boolean;
  onReset: () => void;
}) {
  if (total > 0) {
    return (
      <EmptyState
        title="Tidak ada admin di halaman ini."
        hint="Daftar admin lebih pendek dari nomor halaman yang diminta."
        action={
          <Link href={ADMIN_USERS_PATH} className={LINK_BUTTON}>
            Ke halaman pertama
          </Link>
        }
      />
    );
  }

  if (filtered) {
    return (
      <FilteredEmpty
        title="Tidak ada admin yang cocok dengan pencarian."
        onReset={onReset}
      />
    );
  }

  return (
    <EmptyState
      title="Belum ada admin yang terdaftar."
      hint="Admin muncul di sini begitu akunnya ditambahkan lewat Tambah Admin."
    />
  );
}

/**
 * One row per admin, the six facts the Super Admin scans the list for. A nameless admin (one
 * who signed in before PBI-23) reads by their email, as history does (23.10).
 */
export function AdminUserTable({
  users,
  total,
  filtered = false,
}: {
  users: AdminUser[];
  total: number;
  /** Whether a search narrowed the list, which changes what an empty list means. */
  filtered?: boolean;
}) {
  const { replaceQuery } = useUrlQuery();

  if (users.length === 0) {
    return (
      <EmptyRoster
        total={total}
        filtered={filtered}
        onReset={() => replaceQuery("")}
      />
    );
  }

  return (
    <ScrollFrame>
      <table role="table" className="w-full border-collapse max-lg:block">
        <caption className="sr-only">Daftar admin beserta peran dan statusnya</caption>

        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row">
            {COLUMNS.map((column) => (
              <th key={column} role="columnheader" scope="col" className={HEAD}>
                {column}
              </th>
            ))}
          </tr>
        </thead>

        <tbody role="rowgroup">
          {users.map((user) => {
            const status = adminUserStatus(user);

            return (
              <tr key={user.id} role="row">
                <td className={`${CELL} font-semibold text-ink`}>
                  {adminUserDisplayName(user)}
                </td>
                <td className={`${CELL} wrap-anywhere text-ink-2`}>{user.email}</td>
                <td className={CELL}>
                  <Pill tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Pill>
                </td>
                <td className={CELL}>
                  <StatusDot tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</StatusDot>
                </td>
                <td className={`${CELL} whitespace-nowrap text-ink-2`}>
                  {formatTimestamp(user.lastSignInAt)}
                </td>
                <td className={`${CELL} whitespace-nowrap text-ink-2`}>
                  {formatJakartaDay(user.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollFrame>
  );
}
