import type { ReactNode } from "react";
import type { Platform } from "@/lib/platform-links";
import { PLATFORM_LABELS, PLATFORMS, platformsOf, type ContentLink } from "@/lib/platform-links";

// The two platform marks, drawn as simple inline SVGs so no icon font or image ships with the
// app. Each carries its platform's name for screen readers; the drawing itself says nothing.

const SHAPES: Record<Platform, ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14 4v9.2a3.8 3.8 0 1 1-3.2-3.75" strokeLinecap="round" />
      <path d="M14 4c.6 2.3 2.2 3.6 4.5 3.85" strokeLinecap="round" />
    </svg>
  ),
};

/** One platform's mark, named for what it is. */
export function PlatformIcon({ platform }: Readonly<{ platform: Platform }>) {
  return (
    <span role="img" aria-label={PLATFORM_LABELS[platform]} className="inline-flex size-4 text-muted">
      {SHAPES[platform]}
    </span>
  );
}

/**
 * The platforms a content's links were submitted to, each named once (AC 13): the small marks
 * a table row shows beside its content. Nothing renders while no link has been sent, so a row
 * never grows an empty slot.
 */
export function PlatformIcons({ links }: Readonly<{ links: readonly ContentLink[] }>) {
  const platforms = platformsOf(links);
  if (platforms.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {platforms.map((platform) => (
        <PlatformIcon key={platform} platform={platform} />
      ))}
    </span>
  );
}

/** Every platform, as one row of marks — the full set is rarely needed, but the table shares it. */
export const ALL_PLATFORMS = PLATFORMS;
