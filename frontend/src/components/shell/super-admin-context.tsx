"use client";

import { createContext, useContext, type ReactNode } from "react";

// Who the signed-in Admin is, read once by the admin layout from the session: whether they are a
// Super Admin and the name the frame shows. It only decides what the menu and the frame show;
// every Super Admin page and API checks access on its own. No provider reads as no access and no
// name.
interface SignedInAdmin {
  isSuperAdmin: boolean;
  name: string | null;
}

const SuperAdminContext = createContext<SignedInAdmin>({ isSuperAdmin: false, name: null });

export function SuperAdminProvider({
  isSuperAdmin,
  name = null,
  children,
}: Readonly<{ isSuperAdmin: boolean; name?: string | null; children: ReactNode }>) {
  return (
    <SuperAdminContext.Provider value={{ isSuperAdmin, name }}>{children}</SuperAdminContext.Provider>
  );
}

export function useIsSuperAdmin(): boolean {
  return useContext(SuperAdminContext).isSuperAdmin;
}

/** The signed-in Admin's name, or null when none is set or outside the admin area. */
export function useSignedInName(): string | null {
  return useContext(SuperAdminContext).name;
}
