import type { ReactNode } from "react";

/** The bordered white card every section of the admin interface sits in. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="mb-6 overflow-hidden rounded-[10px] border border-line bg-surface">
      {children}
    </section>
  );
}

export function PanelHead({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-[18px] py-4">
      <div>
        <h2 className="text-[14.5px]">{title}</h2>
        {hint ? <p className="mt-[3px] text-xs text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="p-[18px]">{children}</div>;
}
