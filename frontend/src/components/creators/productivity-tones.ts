import type { Tone } from "@/components/ui/pill";
import type { Productivity } from "@/lib/creators";

// One map for the table and the detail modal, so a band reads the same colour everywhere.
// No data yet is not a warning, so it stays neutral.
export const PRODUCTIVITY_TONES: Record<Productivity, Tone> = {
  good: "green",
  watch: "amber",
  risk: "red",
  no_data: "neutral",
};
