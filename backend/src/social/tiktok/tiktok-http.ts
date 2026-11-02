// One way to call TikTok's API, shared by the connect (19.2) and the performance read (27.3),
// so every call refuses redirects and stops at the caller's deadline the same way (DRY).

export type Json = Record<string, unknown>;

export function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What TikTok answered. `body` is undefined when the answer was not JSON at all. */
export interface TikTokAnswer {
  ok: boolean;
  status: number;
  body: Json | undefined;
}

/** TikTok could not be reached, or did not answer before the deadline. */
export class TikTokUnreachable extends Error {
  override readonly name = 'TikTokUnreachable';
}

/**
 * One call to TikTok: no redirects (one would carry the client secret or a token to whatever
 * host it names, OWASP A01:2025) and cut off at the caller's deadline. JSON that is not an
 * object reads as an empty one, so callers check fields rather than shapes.
 */
export async function callTikTok(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  deadline: AbortSignal,
): Promise<TikTokAnswer> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: deadline,
    });
  } catch {
    throw new TikTokUnreachable();
  }

  let body: Json | undefined;
  try {
    const parsed: unknown = await response.json();
    body = isRecord(parsed) ? parsed : {};
  } catch {
    body = undefined;
  }
  return { ok: response.ok, status: response.status, body };
}
