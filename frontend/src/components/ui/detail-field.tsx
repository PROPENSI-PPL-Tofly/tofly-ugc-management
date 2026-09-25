import type { ReactNode } from "react";

/** A read-only label and value, as the detail modals lay them out. Not a form field. */
export function DetailField({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <p className="mb-1 text-[12.5px] font-semibold">{label}</p>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}
