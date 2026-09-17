import Link from "next/link";
import type { ReactNode } from "react";

// Only the sections that exist are listed; a new one is added here when its page lands.
const NAV = [{ label: "Creator Database", href: "/admin/creators" }] as const;

export interface NavItem {
  label: string;
  href: string;
}

/** The creator-facing area. Kept here so both navs sit side by side. */
export const CREATOR_NAV: readonly NavItem[] = [{ label: "Task Saya", href: "/creator/tasks" }];

export function AppShell({
  title,
  subtitle,
  children,
  nav = NAV,
  who = { label: "Admin", initials: "AD" },
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** The sections of the area this page belongs to; the first is the one shown as current. */
  nav?: readonly NavItem[];
  /** Whose area this is, shown as the avatar in the top bar. */
  who?: { label: string; initials: string };
}) {
  return (
    <div className="flex min-h-screen flex-1">
      <aside className="flex w-[232px] flex-shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2.5 px-6 pb-7 pt-6">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-blue text-base font-bold text-white"
          >
            T
          </span>
          <span className="text-[17px] font-bold tracking-tight text-ink">Tofly</span>
        </div>

        <nav className="flex flex-col">
          {nav.map((item) => (
            // A left rail rather than a tinted block: the rail says "you are here" without
            // turning the item into a button-shaped thing.
            <Link
              key={item.label}
              href={item.href}
              aria-current="page"
              className="border-l-[3px] border-blue bg-blue-wash py-2.5 pl-[21px] pr-6 text-[13.5px] font-semibold text-blue-deep"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line bg-surface px-8">
          <div>
            <h1 className="text-[22px] leading-tight">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p> : null}
          </div>
          <span
            aria-label={who.label}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-tint text-xs font-bold text-blue-deep"
          >
            {who.initials}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-8 pb-16 pt-7">{children}</main>
      </div>
    </div>
  );
}
