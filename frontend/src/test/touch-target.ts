import { MIN_TARGET, PHONE_TARGET } from "@/components/ui/touch-target";

// A min-height only reaches a box that is laid out as one: an inline element such as a link or
// a label ignores it. jsdom loads no stylesheet, so it cannot say how tall anything renders;
// what it can check is the contract that makes the height apply. The heights themselves are
// measured in a browser at 375px.

/** Elements a browser lays out as an inline-block of their own, so a min-height reaches them. */
const BOXED_BY_DEFAULT = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA"]);

/** Tailwind display utilities that make a box a min-height applies to. */
const BOXED_DISPLAYS = new Set(["block", "inline-block", "flex", "inline-flex", "grid", "inline-grid"]);

const ALL_DISPLAYS = new Set([...BOXED_DISPLAYS, "inline", "hidden", "contents", "table"]);

/**
 * The display an element has at a width, read from its classes: a display under one of the
 * `variants` given (max-sm: on a phone) beats an unprefixed one, as it comes later in the
 * stylesheet. Null when no class sets one and the browser's default stands.
 */
function displayFrom(element: Element, variants: readonly string[]): string | null {
  let base: string | null = null;
  let varied: string | null = null;

  for (const name of element.classList) {
    const parts = name.split(":");
    const utility = parts.at(-1) ?? "";
    if (!ALL_DISPLAYS.has(utility)) continue;

    const prefix = parts.slice(0, -1).join(":");
    if (prefix === "") base = utility;
    else if (variants.includes(prefix)) varied = utility;
  }

  return varied ?? base;
}

function isBoxed(element: Element, variants: readonly string[]): boolean {
  const display = displayFrom(element, variants);
  if (display === null) return BOXED_BY_DEFAULT.has(element.tagName);
  return BOXED_DISPLAYS.has(display);
}

function nameOf(element: Element) {
  const name = element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40);
  return `<${element.tagName.toLowerCase()}> "${name}" (${element.className})`;
}

/**
 * A press made at least 44px tall on a phone: it carries PHONE_TARGET, and below sm it is a box
 * the min-height applies to.
 */
export function expectPhoneTarget(element: Element | null | undefined) {
  expect(element).toBeInstanceOf(Element);
  const target = element as Element;
  expect(target).toHaveClass(PHONE_TARGET);
  expect(isBoxed(target, ["max-sm"]), `${nameOf(target)} is inline on a phone`).toBe(true);
}

/**
 * A lone control at least 24px tall at every width: it carries MIN_TARGET and is a box the
 * min-height applies to.
 */
export function expectMinTarget(element: Element | null | undefined) {
  expect(element).toBeInstanceOf(Element);
  const target = element as Element;
  expect(target).toHaveClass(MIN_TARGET);
  expect(isBoxed(target, []), `${nameOf(target)} is inline`).toBe(true);
}
