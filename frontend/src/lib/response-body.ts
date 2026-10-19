// How the invoice payment and comment actions read the backend's answer (PBI-13, subtask 13.4),
// in one place so both read it the same way.

// The backend's answer, or null when it is not JSON at all.
export async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// The words of a refusal the backend wrote for the admin: a 4xx answer with a message. Anything
// else, a server error above all, is not shown as it came (OWASP A10).
export function refusalText(response: Response, body: unknown): string | null {
  const message = (body as { message?: unknown } | null)?.message;
  return response.status < 500 && typeof message === "string" ? message : null;
}
