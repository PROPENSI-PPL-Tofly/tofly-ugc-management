import { ShellNav, type Place } from "./shell-nav";

const PLACES: Place[] = [{ href: "/creator/tasks", label: "Task Saya" }];

/** The places a creator can go. */
export function CreatorNav() {
  return <ShellNav label="Menu creator" places={PLACES} />;
}
