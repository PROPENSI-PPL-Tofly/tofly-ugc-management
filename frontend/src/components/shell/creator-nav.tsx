import { FRAME_THEMES } from "./frame-theme";
import { ShellNav, type Place } from "./shell-nav";

const PLACES: Place[] = [
  { href: "/creator/dashboard", label: "Dashboard", icon: "home" },
  { href: "/creator/tasks", label: "Task Saya", icon: "tasks" },
  { href: "/creator/payments", label: "Pembayaran", icon: "wallet" },
];

/** The places a creator can go. */
export function CreatorNav() {
  return <ShellNav label="Menu creator" places={PLACES} theme={FRAME_THEMES.creator} />;
}
