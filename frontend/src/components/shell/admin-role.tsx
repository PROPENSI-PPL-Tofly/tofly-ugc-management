"use client";

import { createContext, useContext, type ReactNode } from "react";

/** An admin's own role, the two the PBI-23 menus turn on. */
export type AdminRole = "admin" | "super_admin";

// The admin layout reads the role once, from the session, and puts it here: the menu is drawn
// inside the page, so a prop from the layout could not reach it without every page passing it.
const AdminRoleContext = createContext<AdminRole>("admin");

export function AdminRoleProvider({
  role,
  children,
}: Readonly<{ role: AdminRole; children: ReactNode }>) {
  return <AdminRoleContext.Provider value={role}>{children}</AdminRoleContext.Provider>;
}

/** The signed-in admin's role, as the admin area's layout read it. */
export function useAdminRole(): AdminRole {
  return useContext(AdminRoleContext);
}
