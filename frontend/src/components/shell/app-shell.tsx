import Link from "next/link";
import type { ReactNode } from "react";

// The admin sections of the module. Only the ones that exist are links; the rest are listed
// so the shape of the module is visible, but marked unavailable rather than leading nowhere.
const NAV = [
  { label: "Overview", href: null },
  { label: "Creator Database", href: "/admin/creators" },
  { label: "Content Plan", href: null },
  { label: "Performance", href: null },
  { label: "Rate & Invoicing", href: null },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
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

        <p className="px-6 pb-2 text-xs text-muted">Module 1 — UGC Task Management</p>

        <nav className="flex flex-col">
          {NAV.map((item) =>
            item.href ? (
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
            ) : (
              <span
                key={item.label}
                aria-disabled="true"
                title="Belum tersedia"
                className="cursor-not-allowed border-l-[3px] border-transparent py-2.5 pl-[21px] pr-6 text-[13.5px] font-medium text-line-strong"
              >
                {item.label}
              </span>
            ),
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line bg-surface px-8">
          <div>
            <h1 className="text-[22px] leading-tight">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p> : null}
          </div>
          <span
            aria-label="Admin"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-tint text-xs font-bold text-blue-deep"
          >
            AD
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-8 pb-16 pt-7">{children}</main>
      </div>
    </div>
  );
}
