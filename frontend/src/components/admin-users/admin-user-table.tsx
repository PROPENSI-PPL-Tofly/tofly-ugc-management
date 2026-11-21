"use client";

import { ScrollFrame } from "@/components/ui/scroll-frame";
import { Pill, StatusDot, type Tone } from "@/components/ui/pill";
import { formatJakartaDay, formatTimestamp } from "@/lib/format";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  adminUserDisplayName,
  adminUserStatus,
  type AdminRole,
  type AdminStatus,
  type AdminUser,
} from "@/lib/admin-users";

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

/**
 * One row per admin, the six facts the Super Admin scans the list for. A nameless admin (one
 * who signed in before PBI-23) reads by their email, as history does (23.10).
 */
export function AdminUserTable({ users }: { users: AdminUser[] }) {
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
