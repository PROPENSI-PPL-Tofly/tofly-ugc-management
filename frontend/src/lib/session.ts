// Role vocabulary shared by server routing and pages. Plain module (no server-only imports), so
// client code may use it too.

export type Role = "admin" | "creator";

/** The product's full name. "Tofly" alone reads like the company's public site. */
export const APP_NAME = "Tofly Creator Management System";

const HOME: Record<Role, string> = {
  admin: "/admin/creators",
  creator: "/creator/tasks",
};

/** Where each role starts: the page `/` and a signed-in visit to `/login` send them to. */
export function homeFor(role: Role): string {
  return HOME[role];
}
