// Browser-side calls to this app's /api proxy go through here, so a request made after the
// session ended is handled once, the same way everywhere, instead of each form showing its own
// "try again" for something trying again cannot fix.

/**
 * Where a signed-out request lands. A fixed path: no return URL is carried along, so a crafted
 * link can never turn the login page into a redirect to somewhere else (OWASP A01).
 */
export const SESSION_EXPIRED_LOGIN = "/login?error=session_expired";

/**
 * fetch, except that a 401 (no session, or one that expired or was revoked) sends the browser to
 * the login page. The returned promise then never settles: the page is being replaced, so the
 * caller keeps its busy state rather than flashing an error.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status === 401) {
    // A full page load on purpose: it drops the client router cache, which still holds pages
    // rendered for the session that just ended. Callers are plain functions with no router.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(SESSION_EXPIRED_LOGIN);
    return new Promise<Response>(() => {});
  }

  return response;
}
