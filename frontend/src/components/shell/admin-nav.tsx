"use client";

import { FRAME_THEMES } from "./frame-theme";
import { ShellNav, type Place } from "./shell-nav";
import { useIsSuperAdmin } from "./super-admin-context";

const PLACES: Place[] = [
  { href: "/admin/creators", label: "Kreator", icon: "people" },
  { href: "/admin/content-plan", label: "Content Plan", icon: "calendar" },
  { href: "/admin/performance", label: "Performa Konten", icon: "chart" },
  { href: "/admin/invoicing", label: "Pembayaran", icon: "receipt" },
];

// PBI-23 AC 1 and 3: only a Super Admin sees these.
const SUPER_ADMIN_PLACES: Place[] = [
  ...PLACES,
  { href: "/admin/log-aktivitas", label: "Log Aktivitas", icon: "log" },
];

/** The places an admin can go. */
export function AdminNav() {
  const places = useIsSuperAdmin() ? SUPER_ADMIN_PLACES : PLACES;
  return <ShellNav label="Menu admin" places={places} theme={FRAME_THEMES.admin} />;
}
