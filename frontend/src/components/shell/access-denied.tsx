import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { Panel } from "@/components/ui/panel";

/**
 * What a signed-in person sees on a page that belongs to the other role: why, and the way back
 * to their own page. No app frame, so neither the other role's menu nor its data shows.
 */
export function AccessDenied({
  reason,
  home,
  homeLabel,
}: Readonly<{ reason: string; home: string; homeLabel: string }>) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <Panel>
          <div className="px-6 py-7">
            <p className="text-[12.5px] font-semibold text-accent">Tofly</p>
            <h1 className="mt-1 text-[20px]">Akses ditolak</h1>
            <p className="mt-2 text-[13px] text-muted">{reason}</p>
            <Link href={home} className={`mt-6 inline-flex ${buttonClasses()}`}>
              {homeLabel}
            </Link>
          </div>
        </Panel>
      </div>
    </main>
  );
}
