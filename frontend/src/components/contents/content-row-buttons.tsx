"use client";

import type { ReactNode } from "react";

// The door into a content's detail panel that a content table row offers, besides the row itself.
// It sits inside a row that opens the same panel on a press, so it stops its press from reaching
// the row: otherwise the panel would be asked to open twice.

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
