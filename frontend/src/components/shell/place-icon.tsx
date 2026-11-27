/** The icon each place in the menu carries above its name on a phone tile. */
export type PlaceIconName = "dash" | "home" | "tasks" | "wallet" | "people" | "calendar" | "receipt" | "chart" | "shield" | "log";

// One 24-unit stroke drawing per place, in the menu's current colour.
const PATHS: Record<PlaceIconName, readonly string[]> = {
  dash: ["M4 4h6v8H4z", "M14 4h6v4h-6z", "M14 12h6v8h-6z", "M4 16h6v4H4z"],
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5"],
  tasks: ["M9 6h11", "M9 12h11", "M9 18h11", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  wallet: ["M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z", "M3 10h18", "M16 15h2"],
  people: ["M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M2.5 20a6.5 6.5 0 0 1 13 0", "M16 4.5a3.5 3.5 0 0 1 0 7", "M21.5 20a6.5 6.5 0 0 0-4-6"],
  calendar: ["M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M3 10h18", "M8 3v4", "M16 3v4"],
  receipt: ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6", "M9 12h6"],
  // Performa (PBI-19/27): rising bars.
  chart: ["M4 20h16", "M7 16v-4", "M12 16V8", "M17 16V5"],
  // Pengguna Admin (PBI-23, 23.3): a shield, the role that guards the other admins.
  shield: ["M12 3l7 3v5.5c0 4.3-2.8 7.8-7 9.5-4.2-1.7-7-5.2-7-9.5V6z"],
  // Log Aktivitas (PBI-23): a page of entries.
  log: ["M6 3h9l4 4v14H6z", "M15 3v4h4", "M9 12h7", "M9 16h7"],
};

/** Decorative: the place's name is the link's text, so screen readers skip the drawing. */
export function PlaceIcon({
  name,
  className = "size-[22px] shrink-0 md:size-[18px]",
}: Readonly<{ name: PlaceIconName; className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
