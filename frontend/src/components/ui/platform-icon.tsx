import type { ReactNode } from "react";
import type { Platform } from "@/lib/platform-links";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/platform-links";

// The two platform marks, drawn as simple inline SVGs so no icon font or image ships with the
// app, each in its platform's own colours so it is told apart at a glance. Each carries its
// platform's name for screen readers; the drawing itself says nothing.

const SHAPES: Record<Platform, ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="1.9" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="#E1306C" stroke="none" />
    </svg>
  ),
  tiktok: (
    // The mark in ink over its cyan and red echoes, as TikTok draws it.
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <g stroke="#25F4EE" transform="translate(-0.7 -0.7)">
        <path d="M14 4v9.2a3.8 3.8 0 1 1-3.2-3.75" />
        <path d="M14 4c.6 2.3 2.2 3.6 4.5 3.85" />
      </g>
      <g stroke="#FE2C55" transform="translate(0.7 0.7)">
        <path d="M14 4v9.2a3.8 3.8 0 1 1-3.2-3.75" />
        <path d="M14 4c.6 2.3 2.2 3.6 4.5 3.85" />
      </g>
      <g stroke="#111111">
        <path d="M14 4v9.2a3.8 3.8 0 1 1-3.2-3.75" />
        <path d="M14 4c.6 2.3 2.2 3.6 4.5 3.85" />
      </g>
    </svg>
  ),
};

/** One platform's mark, named for what it is. */
export function PlatformIcon({ platform }: Readonly<{ platform: Platform }>) {
  return (
    <span role="img" aria-label={PLATFORM_LABELS[platform]} className="inline-flex size-4">
      {SHAPES[platform]}
    </span>
  );
}

/**
 * The platforms a content has a link for, each named once (AC 13): the small marks a table row
 * shows beside its content. The API sends the list already deduplicated and Instagram first; a
 * platform named twice here is still drawn once. Nothing renders while no link has been sent,
 * so a row never grows an empty slot.
 */
export function PlatformIcons({
  platforms,
}: Readonly<{ platforms: readonly Platform[] }>) {
  const named = [...new Set(platforms)];
  if (named.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {named.map((platform) => (
        <PlatformIcon key={platform} platform={platform} />
      ))}
    </span>
  );
}

/** Every platform, as one row of marks — the full set is rarely needed, but the table shares it. */
export const ALL_PLATFORMS = PLATFORMS;
