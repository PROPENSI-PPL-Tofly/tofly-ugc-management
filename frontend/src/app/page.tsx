import { redirect } from "next/navigation";
import { homeFor } from "@/lib/session";
import { currentRole } from "@/lib/session.server";

export const dynamic = "force-dynamic";

// Tofly's address has no page of its own: it sends each visitor to where they belong.
export default async function Home() {
  const role = await currentRole();
  redirect(role === null ? "/login" : homeFor(role));
}
