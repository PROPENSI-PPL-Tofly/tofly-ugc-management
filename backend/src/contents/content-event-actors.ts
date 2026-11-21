// Who an event in a content's history is by, as every writer stores it. An admin event stores
// the role as its name and the admin's account id; readers name the admin by that account's
// name, or its email while it has none, read fresh each time, so every admin action can be traced
// to the person behind it (PBI-23, 23.10).

/** What an event the app did by itself (the H-1 scheduling) stores as its actor. */
export const SYSTEM_ACTOR_NAME = 'Sistem';

/** What every admin event stores as its actor name, and shows when no account is behind it. */
export const ADMIN_ACTOR_NAME = 'Admin';

/** The only columns a read takes to name an admin: never the role, the status or the id. */
export const ADMIN_ACCOUNT_SELECT = { name: true, email: true } as const;

/** The admin account an actor id points at, as a read selects it. */
export interface AdminAccount {
  /** Optional: an Admin from before PBI-23 has none until a Super Admin sets it. */
  name?: string | null;
  email: string;
}

/** An account's name, or its email when the name is empty; null when no account is behind it. */
export function adminLabel(
  account: AdminAccount | null | undefined,
): string | null {
  if (!account) return null;
  return account.name?.trim() || account.email;
}

/** How an admin is named to whoever reads what they did: by account, else by role. */
export function adminName(account: AdminAccount | null | undefined): string {
  return adminLabel(account) ?? ADMIN_ACTOR_NAME;
}

export interface AdminActor {
  actor_name: typeof ADMIN_ACTOR_NAME;
  actor_role: 'admin';
  /** Null only where no admin is signed in: the local development stand-in for sign-in. */
  actor_user_id: string | null;
}

/** The actor fields of an event an admin caused. */
export function adminActor(adminUserId: string | null): AdminActor {
  return { actor_name: ADMIN_ACTOR_NAME, actor_role: 'admin', actor_user_id: adminUserId };
}
