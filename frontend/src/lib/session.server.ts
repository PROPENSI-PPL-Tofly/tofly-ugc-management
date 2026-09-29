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
