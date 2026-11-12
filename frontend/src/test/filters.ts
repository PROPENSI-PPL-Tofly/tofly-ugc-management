import { fireEvent, screen } from "@testing-library/react";

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Opens a one-choice filter by its label and picks an option by its words, as a person would. */
export function pickFilter(label: string, option: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${escaped(label)}:`) }));
  fireEvent.click(screen.getByRole("radio", { name: option }));
}

/** The pill of a one-choice filter, named by its label. */
export function filterPill(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${escaped(label)}:`) });
}
