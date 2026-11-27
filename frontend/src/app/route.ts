import { homeFor } from "@/lib/session";
import { currentRole } from "@/lib/session.server";

export const dynamic = "force-dynamic";

/**
 * Tofly's address has no page of its own: it sends each visitor to where they belong. A route
 * handler rather than a page's redirect(), which answers the 307 with a whole HTML document
 * (ZAP 10044). The location stays relative, so it holds behind Firebase Hosting's rewrite too.
 */
export async function GET(): Promise<Response> {
  const role = await currentRole();
  return new Response(null, {
    status: 307,
    headers: {
      Location: role === null ? "/login" : homeFor(role),
      "Cache-Control": "no-store",
    },
  });
}
