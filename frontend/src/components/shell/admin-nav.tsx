import { ShellNav, type Place } from "./shell-nav";

const PLACES: Place[] = [
  { href: "/admin/creators", label: "Creator Database" },
  // The draft queue is opened from Content Plan (All), so it stays under that tab.
  { href: "/admin/content-plan", label: "Content Plan (All)", covers: ["/admin/submissions"] },
];

/** The places an admin can go. */
export function AdminNav() {
  return <ShellNav label="Menu admin" places={PLACES} />;
}
