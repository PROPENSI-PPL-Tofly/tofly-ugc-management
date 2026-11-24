// Server-side only: who the browser is signed in as, for routing before a page renders. It reads
// the session cookie through next/headers, so it stays apart from modules client code imports.

import type { Role } from "./session";
import { appSessionCookieHeader } from "./session-cookie";

export type { Role };

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * The signed-in role, or null when nobody is: no session cookie, or one the backend refuses
 * (expired, signed out, revoked). Anything else the backend says is an error, not a guess.
 */
export async function currentRole(): Promise<Role | null> {
  const cookie = await appSessionCookieHeader();
  if (!cookie) return null;

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const response = await fetch(`${withoutTrailingSlash(backendUrl)}/auth/session`, {
    cache: "no-store",
    headers: { cookie },
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Reading the session failed with HTTP ${response.status}`);
  }

  const { role } = (await response.json()) as { role?: unknown };
  if (role !== "admin" && role !== "creator") {
    throw new Error("The session answer named no known role");
  }
  return role;
}

/**
 * Whether the signed-in Admin is a Super Admin (PBI-23), the one role that sees "Atur Buffer
 * Deadline". It reads `adminRole` from the same session answer, which 23.1 adds; anything short
 * of an Admin named super_admin, an error included, is false, so the setting fails closed. The
 * backend's SuperAdminGuard still refuses everyone else.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const cookie = await appSessionCookieHeader();
  const backendUrl = process.env.BACKEND_URL;
  if (!cookie || !backendUrl) return false;

  try {
    const response = await fetch(`${withoutTrailingSlash(backendUrl)}/auth/session`, {
      cache: "no-store",
      headers: { cookie },
    });
    if (!response.ok) return false;

    const { role, adminRole } = (await response.json()) as { role?: unknown; adminRole?: unknown };
    return role === "admin" && adminRole === "super_admin";
  } catch {
    return false;
  }
}
