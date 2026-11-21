"use client";

import { useAdminRole } from "./admin-role";
import { FRAME_THEMES } from "./frame-theme";
import { ShellNav, type Place } from "./shell-nav";

// The four places every admin works in.
const EVERYDAY: Place[] = [
  { href: "/admin/creators", label: "Kreator", icon: "people" },
  { href: "/admin/content-plan", label: "Content Plan", icon: "calendar" },
  { href: "/admin/performance", label: "Performa Konten", icon: "chart" },
  { href: "/admin/invoicing", label: "Pembayaran", icon: "receipt" },
];

// Runs Tofly itself: who is an admin and what they changed. Super Admin only (AC 3).
const SUPER_ADMIN_ONLY: Place[] = [
  { href: "/admin/users", label: "Pengguna Admin", icon: "shield" },
];

/** The places an admin can go; a Super Admin gets the Super Admin door beside them. */
export function AdminNav() {
  const role = useAdminRole();
  const places = role === "super_admin" ? [...EVERYDAY, ...SUPER_ADMIN_ONLY] : EVERYDAY;

  return <ShellNav label="Menu admin" places={places} theme={FRAME_THEMES.admin} />;
}
