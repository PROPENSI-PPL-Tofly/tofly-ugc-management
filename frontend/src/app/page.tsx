import { redirect } from "next/navigation";
import { currentRole } from "@/lib/session.server";

export const dynamic = "force-dynamic";

// Tofly's address has no page of its own: it sends each visitor to where they belong.
export default async function Home() {
  const role = await currentRole();
  if (role === "admin") redirect("/admin/creators");
  if (role === "creator") redirect("/creator/tasks");
  redirect("/login");
}
