// Who an event in a content's history is by, as every writer stores it. An admin event stores
// the role as its name and the admin's account id; readers name the admin by that account's
// email, read fresh each time, so every admin action can be traced to the person behind it.

/** What an event the app did by itself (the H-1 scheduling) stores as its actor. */
export const SYSTEM_ACTOR_NAME = 'Sistem';

/** What every admin event stores as its actor name, and shows when no account is behind it. */
export const ADMIN_ACTOR_NAME = 'Admin';

/** The admin account an actor id points at, as a read selects it. */
export interface AdminAccount {
  email: string;
}

/** How an admin is named to whoever reads what they did: by email, else by role. */
export function adminName(account: AdminAccount | null | undefined): string {
  return account?.email ?? ADMIN_ACTOR_NAME;
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
