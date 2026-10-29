import { ShellNav, type Place } from "./shell-nav";

const PLACES: Place[] = [
  { href: "/creator/dashboard", label: "Dashboard" },
  { href: "/creator/tasks", label: "Task Saya" },
  { href: "/creator/payments", label: "Pembayaran" },
];

/** The places a creator can go. */
export function CreatorNav() {
  return <ShellNav label="Menu creator" places={PLACES} />;
}
