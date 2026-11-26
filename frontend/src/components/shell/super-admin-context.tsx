"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether the signed-in Admin is a Super Admin, read once by the admin layout. It only decides what
// the menu shows; every Super Admin page and API checks access on its own. No provider reads as
// no access.
const SuperAdminContext = createContext(false);

export function SuperAdminProvider({
  isSuperAdmin,
  children,
}: Readonly<{ isSuperAdmin: boolean; children: ReactNode }>) {
  return <SuperAdminContext.Provider value={isSuperAdmin}>{children}</SuperAdminContext.Provider>;
}

export function useIsSuperAdmin(): boolean {
  return useContext(SuperAdminContext);
}
