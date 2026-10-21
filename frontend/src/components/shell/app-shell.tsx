import Link from "next/link";
import type { ReactNode } from "react";
import { homeFor, type Role } from "@/lib/session";
import { AdminNav } from "./admin-nav";
import { CreatorNav } from "./creator-nav";
import { FRAME_THEMES } from "./frame-theme";
import { LogoutButton } from "./logout-button";
import { SessionActivity } from "./session-activity";

// What a role's frame holds: its menu. How the frame is drawn is the role's FrameTheme; where
// the wordmark leads is the role's home, which lib/session.ts owns, so sign-in and the
// wordmark cannot disagree.
const MENUS: Record<Role, ReactNode> = {
  admin: <AdminNav />,
  creator: <CreatorNav />,
};

/**
 * The app frame, drawn with the role's theme. From md up: a rail on the left with the wordmark
 * and the role, the places the role can go, and at its foot who is signed in with the way out.
 * On a phone the rail is a top bar in the role's colour (wordmark, role tag, Keluar) and the
 * menu is a bar of tiles fixed to the foot of the screen, which the content keeps clear of.
 */
export function AppShell({
  role = "admin",
  title,
  subtitle,
  children,
}: Readonly<{
  role?: Role;
  title: string;
  subtitle?: string;
  children: ReactNode;
}>) {
  const theme = FRAME_THEMES[role];

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:grid md:grid-cols-[13.5rem_minmax(0,1fr)]">
      <SessionActivity />
      <aside
        data-frame={role}
        className={`flex items-center gap-x-3 px-4 py-2 md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:gap-8 md:px-4 md:py-6 ${theme.rail}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={homeFor(role)}
            className={`inline-flex items-center gap-2 rounded-(--radius-control) text-base font-bold tracking-tight ${theme.wordmark}`}
          >
            <span aria-hidden="true" className={`size-2 rounded-[3px] ${theme.wordmarkDot}`} />
            tofly
          </Link>
          <span
            data-role-tag=""
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${theme.tag}`}
          >
            {theme.label}
          </span>
        </div>

        {/* Below md the menu is a bar of tiles fixed to the foot of the screen. */}
        <div className="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t-[1.5px] max-md:border-rule max-md:bg-surface max-md:px-2.5 max-md:pt-2 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-4px_14px_oklch(20%_0.03_262/0.08)] md:flex-1">
          {MENUS[role]}
        </div>

        <div
          role="group"
          aria-label="Akun"
          className={`ml-auto flex items-center md:ml-0 md:flex-col md:items-stretch md:gap-2 md:border-t md:pt-4 ${theme.account}`}
        >
          <p className="hidden px-3 text-xs md:block">
            Masuk sebagai
            <span className="mt-0.5 block text-[13px] font-semibold">{theme.label}</span>
          </p>
          <LogoutButton tone={theme.logout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col max-md:pb-28">
        <header className="px-4 pb-4 pt-6 md:px-8 md:pt-8">
          <h1 className="text-[22px]">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-[60ch] text-[13px] text-muted">{subtitle}</p> : null}
        </header>
        <main className="flex-1 px-4 pb-10 md:px-8">{children}</main>
      </div>
    </div>
  );
}
