import { cookies } from "next/headers";

const APP_SESSION_COOKIES = new Set(["tofly_session", "__Host-tofly_session"]);

/** Forward only the application credential from a server-rendered request. */
export async function appSessionCookieHeader(): Promise<string | undefined> {
  const sessionCookies = (await cookies())
    .getAll()
    .filter(({ name }) => APP_SESSION_COOKIES.has(name));
  if (sessionCookies.length === 0) return undefined;
  return sessionCookies
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}
