// Who an event in a content's history is by, as every writer stores it. The history is shown to
// the creator too, so an admin is named by role only and kept by account id for the audit; the
// email address never goes into it (OWASP A01).

/** What every admin event shows as its actor. */
export const ADMIN_ACTOR_NAME = 'Admin';

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
