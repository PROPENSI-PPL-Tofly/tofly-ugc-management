import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";
import { CreatorNav } from "./creator-nav";

type Role = "admin" | "creator";

// What changes between the two frames: where the wordmark leads, the menu, and the label.
const FRAMES: Record<Role, { home: string; nav: ReactNode; label: string }> = {
  admin: { home: "/admin/creators", nav: <AdminNav />, label: "Admin" },
  creator: { home: "/creator/tasks", nav: <CreatorNav />, label: "Creator" },
};

/**
 * The app frame: a narrow rail on the left with the wordmark and the places the signed-in
 * role can go, the page title above the content. On a phone the rail folds into a top bar.
 */
export function AppShell({
  role = "admin",
  title,
  subtitle,
  children,
}: {
  role?: Role;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const frame = FRAMES[role];

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:grid md:grid-cols-[13.5rem_minmax(0,1fr)]">
      <aside className="flex items-center gap-4 border-b border-rule bg-surface px-4 py-3 md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:gap-8 md:border-b-0 md:border-r md:px-4 md:py-6">
        <Link
          href={frame.home}
          className="inline-flex items-center gap-2 rounded-(--radius-control) text-base font-bold tracking-tight text-ink"
        >
          <span aria-hidden="true" className="size-2 rounded-[3px] bg-accent" />
          tofly
        </Link>
        {frame.nav}
        <p className="hidden text-xs text-muted md:block">{frame.label}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="px-4 pb-4 pt-6 md:px-8 md:pt-8">
          <h1 className="text-[22px]">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-[60ch] text-[13px] text-muted">{subtitle}</p> : null}
        </header>
        <main className="flex-1 px-4 pb-10 md:px-8">{children}</main>
      </div>
    </div>
  );
}
