import { redirect } from "next/navigation";

// The admin area is the only thing this app serves today, so the root goes straight there
// rather than to a landing page nobody asked for.
export default function Home() {
  redirect("/admin/creators");
}
