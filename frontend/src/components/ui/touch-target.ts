// Press sizes, as classes any component can add. Plain module so server components can use them.

/**
 * A main way around on a phone, such as a menu item, a tab, a filter or a page's action: at
 * least 44px tall below sm, the press Apple and Android ask for and WCAG 2.5.5 names. The
 * element must be a block or flex box for a min-height to apply.
 */
export const PHONE_TARGET = "max-sm:min-h-11";

/**
 * Any lone control at every width: at least 24px tall, WCAG 2.5.8's minimum. A link inside a
 * sentence is exempt and does not need it. The element must be a block or flex box.
 */
export const MIN_TARGET = "min-h-6";
