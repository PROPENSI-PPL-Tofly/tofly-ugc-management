// Server-side only: who the browser is signed in as, for routing before a page renders. It reads
// the session cookie through next/headers, so it stays apart from modules client code imports.

import { cache } from "react";
import type { Role } from "./session";
import { appSessionCookieHeader } from "./session-cookie";

export type { Role };

export interface Session {
  role: Role;
  isSuperAdmin: boolean;
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// Who is signed in, or null when nobody is: no session cookie, or one the backend refuses
// (expired, signed out, revoked). Anything else the backend says is an error, not a guess. Only
// the exact "super_admin" on an Admin opens Super Admin pages (OWASP A01:2025). Cached per render,
// so the layout and its page ask the backend once.
export const currentSession = cache(async (): Promise<Session | null> => {
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

  const { role, adminRole } = (await response.json()) as { role?: unknown; adminRole?: unknown };
  if (role !== "admin" && role !== "creator") {
    throw new Error("The session answer named no known role");
  }
  return { role, isSuperAdmin: role === "admin" && adminRole === "super_admin" };
});

/** The signed-in role, or null when nobody is. */
export async function currentRole(): Promise<Role | null> {
  return (await currentSession())?.role ?? null;
}
