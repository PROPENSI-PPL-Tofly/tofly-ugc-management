import type { Role } from "@/lib/session";

/**
 * How a role's frame is drawn. On a phone the rail is a top bar in the role's colour with the
 * role named beside the wordmark, and the menu is a bar of tiles at the foot of the screen
 * whose current tile takes the top bar's colour; from md up the rail is the left column.
 *
 * Strategy: each role is handed one theme, and the shell and its menu draw whichever theme they
 * are given. Neither asks which role it is, so a new role is a new theme here rather than a new
 * branch in either component, and a theme can be checked on its own.
 */
export interface FrameTheme {
  /** Who the frame is for, as the tag beside the wordmark and "Masuk sebagai" name it. */
  label: string;
  /** The rail: the phone's top bar and, from md up, the left column. */
  rail: string;
  /** The wordmark's text and its square. */
  wordmark: string;
  wordmarkDot: string;
  /** The role tag beside the wordmark. */
  tag: string;
  /** "Masuk sebagai" and Keluar in the rail's foot (Keluar sits in the top bar on a phone). */
  account: string;
  logout: string;
  /** A place in the menu from md up, while it is not the page on screen. */
  place: string;
  /** The place on screen: the phone tile and the rail entry alike. */
  placeOn: string;
}

export const FRAME_THEMES: Record<Role, FrameTheme> = {
  // Brand blue on a phone, the light rail from md up.
  creator: {
    label: "Creator",
    rail: "max-md:bg-accent-deep max-md:text-accent-ink md:border-r md:border-rule md:bg-surface",
    wordmark: "max-md:text-accent-ink md:text-ink",
    wordmarkDot: "max-md:bg-accent-wash md:bg-accent",
    tag: "max-md:bg-accent-ink/20 max-md:text-accent-ink md:bg-accent-wash md:text-accent-deep",
    account: "md:border-rule md:text-muted",
    logout:
      "max-md:text-accent-ink max-md:hover:bg-accent-ink/15 max-md:active:bg-accent-ink/25 md:text-ink-2 md:hover:bg-surface-2 md:hover:text-ink md:active:bg-rule-2",
    place: "md:bg-transparent md:text-ink-2 md:hover:bg-surface-2 md:hover:text-ink",
    placeOn:
      "aria-[current=page]:bg-accent-deep aria-[current=page]:text-accent-ink md:aria-[current=page]:bg-accent",
  },
  // Navy at every width, so an admin always knows whose tool this is.
  admin: {
    label: "Admin",
    rail: "bg-ink text-accent-ink",
    wordmark: "text-accent-ink",
    wordmarkDot: "bg-accent",
    tag: "bg-accent-ink/15 text-accent-ink",
    account: "md:border-ink-2 md:text-rule",
    logout:
      "text-rule hover:bg-accent-ink/10 hover:text-accent-ink active:bg-accent-ink/20",
    place: "md:bg-accent-ink/5 md:text-rule md:hover:bg-accent-ink/15 md:hover:text-accent-ink",
    placeOn:
      "aria-[current=page]:bg-ink aria-[current=page]:text-accent-ink md:aria-[current=page]:bg-accent",
  },
};
