import { ShellNav, type Place } from "./shell-nav";

const PLACES: Place[] = [
  { href: "/admin/creators", label: "Creator Database" },
  { href: "/admin/content-plan", label: "Content Plan" },
];

/** The places an admin can go. */
export function AdminNav() {
  return <ShellNav label="Menu admin" places={PLACES} />;
}
