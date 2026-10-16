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
}: Readonly<{ onOpen: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => {
        event.stopPropagation();
        if (window.getSelection()?.toString()) return;
        onOpen();
      }}
      className="cursor-pointer border-none bg-transparent p-0 text-left font-inherit text-inherit hover:underline"
    >
      {children}
    </button>
  );
}

/**
 * Tinjau, for a content whose next step is the admin's decision. Nothing for any other status:
 * the name already opens those, so a second button would only repeat it.
 */
export function ReviewButton({
  status,
  name,
  onOpen,
}: Readonly<{ status: ContentStatus; name: string; onOpen: () => void }>) {
  if (!needsReview(status)) return null;

  return (
    <button
      type="button"
      // The content's name tells one row's Tinjau from another's when heard.
      aria-label={`Tinjau ${name}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={`${buttonClasses("accent")} px-2 py-1`}
    >
      Tinjau
    </button>
  );
}
