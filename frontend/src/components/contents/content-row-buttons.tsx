"use client";

import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { needsReview } from "@/lib/content-plan";
import type { ContentStatus } from "@/lib/creators";

// The two doors into a content's detail panel that a content table row offers. Both sit inside
// a row that opens the same panel on a press, so each stops its press from reaching the row:
// otherwise the panel would be asked to open twice.

/**
 * A content's name as the button that opens its panel: the row's door for the keyboard and for
 * screen readers. It reads as plain text. A press that ends a text selection is copying, not
 * opening, as on the row itself.
 */
export function ContentNameButton({
  onOpen,
  children,
  underlined = false,
}: Readonly<{
  onOpen: () => void;
  children: ReactNode;
  /** Underlined at rest, where the row does not otherwise say the name opens something. */
  underlined?: boolean;
}>) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => {
        event.stopPropagation();
        if (window.getSelection()?.toString()) return;
        onOpen();
      }}
      className={`cursor-pointer border-none bg-transparent p-0 text-left font-inherit text-inherit ${
        underlined ? "underline decoration-rule underline-offset-[3px] hover:decoration-ink" : "hover:underline"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A content row's action, on Creator Detail and Content Plan alike: Tinjau, filled in the accent, where the admin's decision
 * is waiting; a quiet Detail for every other status, so each row offers the same door.
 */
export function RowActionButton({
  status,
  name,
  onOpen,
}: Readonly<{ status: ContentStatus; name: string; onOpen: () => void }>) {
  const review = needsReview(status);
  const label = review ? "Tinjau" : "Detail";

  return (
    <button
      type="button"
      // The content's name tells one row's button from another's when heard.
      aria-label={`${label} ${name}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={`${buttonClasses(review ? "accent" : "default")} px-2 py-1 max-lg:min-h-11 max-lg:w-full`}
    >
      {label}
    </button>
  );
}
