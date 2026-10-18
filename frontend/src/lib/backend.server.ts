// Server-side only: a GET to the backend on the signed-in browser's behalf. The invoice loaders
// share it; it reads the session through next/headers, which client components cannot import.

import { appSessionCookieHeader } from "./session-cookie";

function withoutTrailingSlash(url: string): string {
  let end = url.length;

  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }

  return url.slice(0, end);
}

/**
 * Asks the backend for `path` with the browser's session cookie and nothing else, never from a
 * cache. The address never reaches the browser. BACKEND_URL is read per call because it is a
 * plain runtime variable on the deployed service; a module-scope read would freeze whatever it
 * was at build time.
 */
export async function backendGet(path: string): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const cookie = await appSessionCookieHeader();
  return fetch(`${withoutTrailingSlash(backendUrl)}${path}`, {
    cache: "no-store",
    ...(cookie && { headers: { cookie } }),
  });
}
