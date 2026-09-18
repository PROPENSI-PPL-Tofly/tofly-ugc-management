import { redirect } from "next/navigation";

// The admin area is the only thing this app serves today, so the root goes straight there.
export default function Home() {
  redirect("/admin/creators");
}
