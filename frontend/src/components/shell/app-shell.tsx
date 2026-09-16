import Link from "next/link";
import type { ReactNode } from "react";

// The admin sections of the module. Only the ones that exist are links; the rest are listed
// so the shape of the module is visible, but marked unavailable rather than leading nowhere.
const NAV = [
  { label: "Overview", href: null },
  { label: "Creator Database", href: "/admin/creators" },
  { label: "Content Plan (All)", href: null },
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
      <aside className="flex w-[236px] flex-shrink-0 flex-col border-r border-line bg-surface px-4 py-5">
        <div className="flex items-center gap-2.5 px-1.5 pb-[22px] pt-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-ink font-heading text-sm font-bold text-white">
            T
          </span>
          <span className="font-heading text-base font-bold">Tofly</span>
        </div>

        <p className="mb-1.5 px-2.5 text-[11px] text-muted">Module 1 — UGC Task Management</p>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-[6px] bg-accent-dim px-2.5 py-2.5 text-[13.5px] font-semibold text-accent"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                aria-disabled="true"
                title="Belum tersedia"
                className="cursor-not-allowed rounded-[6px] px-2.5 py-2.5 text-[13.5px] font-medium text-line-strong"
              >
                {item.label}
              </span>
            ),
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-line bg-surface px-7">
          <div>
            <h1 className="text-lg">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p> : null}
          </div>
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-ink font-heading text-xs font-bold text-white">
            AD
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-7 pb-14 pt-6">{children}</main>
      </div>
    </div>
  );
}
