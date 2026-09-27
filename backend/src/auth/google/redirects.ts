import type { Principal } from './ports.js';

/** Why a sign-in ended back on the login page; the page owns the wording. */
export type SignInError = 'not_authorized' | 'sign_in_failed' | 'cancelled';

// Fixed, same-origin paths only. Nothing from the request decides where a sign-in lands,
// so the callback cannot be turned into an open redirect.
const LANDING: Record<Principal['role'], string> = {
  admin: '/admin/creators',
  creator: '/creator/tasks',
};

/** Each role's first page after signing in (PRD 3.1: "the corresponding view loads"). */
export function landingPath(principal: Principal): string {
  return LANDING[principal.role];
}

export function loginErrorPath(error: SignInError): string {
  return `/login?error=${error}`;
}
