import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { Panel } from "@/components/ui/panel";
import { APP_NAME } from "@/lib/session";

/**
 * What someone sees on a page they may not open: signed out, or signed in as the other role.
 * Says why and gives the one way forward. No app frame, so no menu and no data shows.
 */
export function AccessDenied({
  title = "Akses ditolak",
  reason,
  home,
  homeLabel,
}: Readonly<{ title?: string; reason: string; home: string; homeLabel: string }>) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <Panel>
          <div className="px-6 py-7">
            <p className="text-[12.5px] font-semibold text-accent">{APP_NAME}</p>
            <h1 className="mt-1 text-[20px]">{title}</h1>
            <p className="mt-2 text-[13px] text-muted">{reason}</p>
            <Link href={home} className={`mt-6 inline-flex ${buttonClasses("accent")}`}>
              {homeLabel}
            </Link>
          </div>
        </Panel>
      </div>
    </main>
  );
}
