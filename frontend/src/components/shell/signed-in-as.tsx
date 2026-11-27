"use client";

import type { Role } from "@/lib/session";
import { FRAME_THEMES } from "./frame-theme";
import { useIsSuperAdmin, useSignedInName } from "./super-admin-context";

/**
 * Which role the frame belongs to. An admin frame asks the session the admin layout read, so a
 * Super Admin is tagged as one on every page rather than only where a page remembered to say so.
 */
function useFrameLabel(role: Role): string {
  const isSuperAdmin = useIsSuperAdmin();
  if (role === "creator") return FRAME_THEMES.creator.label;
  return isSuperAdmin ? FRAME_THEMES.super_admin.label : FRAME_THEMES.admin.label;
}

/** The tag beside the wordmark. */
export function RoleTag({ role, className }: Readonly<{ role: Role; className: string }>) {
  return (
    <span data-role-tag="" className={className}>
      {useFrameLabel(role)}
    </span>
  );
}

/** "Masuk sebagai": the Admin's name, or the role when the account has none. */
export function SignedInName({ role }: Readonly<{ role: Role }>) {
  const label = useFrameLabel(role);
  const name = useSignedInName();
  return (
    <span className="mt-0.5 block text-[13px] font-semibold">
      {role === "creator" ? label : (name ?? label)}
    </span>
  );
}
