import type { AdminRole } from '../../auth/google/ports.js';

/** One row of "Pengguna Admin" (PBI-23): name, email, role, status, last sign-in, date added. */
export interface AdminUserDto {
  id: string;
  /** Null for an Admin from before PBI-23 until a Super Admin names them. */
  name: string | null;
  email: string;
  role: AdminRole;
  /** "Aktif" or "Nonaktif". */
  status: 'active' | 'inactive';
  /** ISO time; null when they never signed in ("Belum pernah"). */
  lastSignedInAt: string | null;
  createdAt: string;
  /** The signed-in Super Admin's own row: no role change or deactivation for it. */
  isSelf: boolean;
}

export interface AdminUserListResponse {
  items: AdminUserDto[];
  page: number;
  pageSize: number;
  /** Admins matching the search, across every page. */
  total: number;
  totalPages: number;
  /** The whole team, for "N aktif · M nonaktif", whatever the search. */
  activeCount: number;
  inactiveCount: number;
}
