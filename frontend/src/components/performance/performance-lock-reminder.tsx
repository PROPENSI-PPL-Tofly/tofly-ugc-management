import { PERFORMANCE_LOCK_REMINDER } from "@/lib/link-performance";

/**
 * The reminder that performance numbers lock at Finalize (PBI-28 AC 13), drawn as the
 * prototype's note box. One component for Kirim Link Video and the Performa page, so both
 * always say the same thing the same way.
 */
export function PerformanceLockReminder({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <p
      role="note"
      className={`rounded-(--radius-control) border border-rule bg-paper px-2.5 py-2 text-xs text-ink ${className}`}
    >
      {PERFORMANCE_LOCK_REMINDER}
    </p>
  );
}
