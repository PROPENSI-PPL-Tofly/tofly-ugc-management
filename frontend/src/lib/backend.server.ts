// Server-side only: a call to the backend on the signed-in browser's behalf. The invoice loaders
// and the invoice actions share it; it reads the session through next/headers, which client
// components cannot import.

import { headers } from "next/headers";
import { appSessionCookieHeader } from "./session-cookie";

/**
 * The browser's own Origin and Sec-Fetch-Site from the request that invoked the action. The
 * backend refuses a state change without them (assertSameOrigin), and Next has already refused a
 * server action whose Origin does not match its host, so they are passed on as sent, the way the
 * /api proxy passes them, and never made up here.
 */
async function browserOriginHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const forwarded: Record<string, string> = {};
  for (const name of ["origin", "sec-fetch-site"]) {
    const value = incoming.get(name);
    if (value !== null) forwarded[name] = value;
  }
  return forwarded;
}

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

/** The same request as a POST with a JSON body, for the two invoice actions. */
export async function backendPost(path: string, body: unknown = {}): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const cookie = await appSessionCookieHeader();
  return fetch(`${withoutTrailingSlash(backendUrl)}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(await browserOriginHeaders()),
      ...(cookie && { cookie }),
    },
    body: JSON.stringify(body),
  });
}

// The same request as a POST with a multipart form, for the payment proof upload. No content
// type is set here: fetch writes the multipart boundary itself, and a hand-written one breaks it.
export async function backendPostForm(path: string, form: FormData): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const cookie = await appSessionCookieHeader();
  return fetch(`${withoutTrailingSlash(backendUrl)}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...(await browserOriginHeaders()),
      ...(cookie && { cookie }),
    },
    body: form,
  });
}

/**
 * The same request as a DELETE with no body, for disconnecting a social account. A state change,
 * so it carries the browser's origin headers like the posts: the backend refuses it without them.
 */
export async function backendDelete(path: string): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const cookie = await appSessionCookieHeader();
  return fetch(`${withoutTrailingSlash(backendUrl)}${path}`, {
    method: "DELETE",
    cache: "no-store",
    headers: {
      ...(await browserOriginHeaders()),
      ...(cookie && { cookie }),
    },
  });
}
