import { useId } from "react";
import {
  connectionLabel,
  connectionTooltip,
  type SocialConnection,
} from "@/lib/social-connection";

// The prototype's badge is smaller than Pill, which stays as the productivity column has it.
const BADGE =
  "inline-flex cursor-help items-center whitespace-nowrap rounded-full px-2 text-[10.5px] font-semibold leading-[17px]";
const ON = `${BADGE} bg-green-wash text-green-ink`;
const OFF = `${BADGE} bg-surface-2 text-muted`;

// Whether one of a creator's accounts is connected (PBI-19, AC 11, 12). The badge is a button
// so the keyboard reaches it too, and its tooltip, the connection day and last sync, opens on
// hover and on focus, in the same bubble as InfoTip.
export function ConnectionBadge({
  platform,
  connection,
}: Readonly<{
  // Spoken before the label, so a screen reader hears "Instagram Terhubung", not only "Terhubung".
  platform: string;
  connection: SocialConnection;
}>) {
  const tipId = useId();
  const label = connectionLabel(connection);

  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`${platform} ${label}`}
        aria-describedby={tipId}
        className={connection.connected ? ON : OFF}
      >
        {label}
      </button>
      {/* A sibling, not a child: inside the button it would also be read as its name. */}
      <span
        // No role="tooltip": aria-describedby already reads it, and the role stays InfoTip's.
        id={tipId}
        className="pointer-events-none invisible absolute top-full left-0 z-10 mt-1.5 w-max max-w-[260px] whitespace-normal rounded-(--radius-control) bg-ink px-3 py-2 text-left text-xs font-normal leading-snug text-accent-ink opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {connectionTooltip(connection)}
      </span>
    </span>
  );
}
