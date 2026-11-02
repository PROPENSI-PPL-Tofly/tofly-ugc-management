import { FRAME_THEMES } from "./frame-theme";
import { ShellNav, type Place } from "./shell-nav";

const PLACES: Place[] = [
  { href: "/admin/creators", label: "Creator Database", icon: "people" },
  { href: "/admin/content-plan", label: "Content Plan", icon: "calendar" },
  { href: "/admin/invoicing", label: "Rate & Invoicing", icon: "receipt" },
];

/** The places an admin can go. */
export function AdminNav() {
  return <ShellNav label="Menu admin" places={PLACES} theme={FRAME_THEMES.admin} />;
}
