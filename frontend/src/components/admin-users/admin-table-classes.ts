// The Pengguna Admin table's classes, shared by the facts and the row's actions so the two stay one
// layout. From lg up it is a table; below lg each row is a card whose cells name their column from
// data-label (a ::before label, so the CSP still refuses inline styles).

export const ADMIN_ROW =
  "max-lg:block max-lg:rounded-(--radius-panel) max-lg:border max-lg:border-rule max-lg:bg-surface max-lg:px-4 max-lg:py-3";

export const ADMIN_CELL =
  "border-b border-rule-2 px-5 py-3 align-top text-[13px] max-lg:flex max-lg:items-start max-lg:gap-2 max-lg:border-0 max-lg:px-0 max-lg:py-1 max-lg:before:w-24 max-lg:before:shrink-0 max-lg:before:pt-0.5 max-lg:before:text-xs max-lg:before:font-normal max-lg:before:text-muted max-lg:before:content-[attr(data-label)]";
