import type { ReactNode } from "react";

/** The bordered surface a section of the admin interface sits on. One containment layer. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-(--radius-panel) border border-rule bg-surface shadow-whisper">
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div>
        <h2 className="text-[15px]">{title}</h2>
        {hint ? <p className="mt-1 max-w-[64ch] text-[12.5px] text-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
