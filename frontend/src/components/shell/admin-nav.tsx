"use client";

import { ADMIN_USERS_PATH } from "@/lib/admin-users";
import { FRAME_THEMES } from "./frame-theme";
import { ShellNav, type Place } from "./shell-nav";
import { useIsSuperAdmin } from "./super-admin-context";

// The four places every admin works in.
const EVERYDAY: Place[] = [
  { href: "/admin/creators", label: "Kreator", icon: "people" },
  { href: "/admin/content-plan", label: "Content Plan", icon: "calendar" },
  { href: "/admin/performance", label: "Performa Konten", icon: "chart" },
  { href: "/admin/invoicing", label: "Pembayaran", icon: "receipt" },
];

// Runs Tofly itself: who is an admin and what they changed. Super Admin only (PBI-23 AC 1 and 3).
const SUPER_ADMIN_PLACES: Place[] = [
  ...EVERYDAY,
  { href: ADMIN_USERS_PATH, label: "Pengguna Admin", icon: "shield" },
  { href: "/admin/log-aktivitas", label: "Log Aktivitas", icon: "log" },
];

/** The places an admin can go; a Super Admin gets the Super Admin places beside them. */
export function AdminNav() {
  const places = useIsSuperAdmin() ? SUPER_ADMIN_PLACES : EVERYDAY;
  return <ShellNav label="Menu admin" places={places} theme={FRAME_THEMES.admin} />;
}
