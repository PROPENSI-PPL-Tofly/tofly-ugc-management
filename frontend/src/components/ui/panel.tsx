import type { ReactNode } from "react";

/** The bordered white surface a section of the admin interface sits in. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="mb-6 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
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
    <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
      <div>
        <h2 className="text-[15px]">{title}</h2>
        {hint ? <p className="mt-1 max-w-[64ch] text-[12.5px] text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="px-5 pb-5">{children}</div>;
}
