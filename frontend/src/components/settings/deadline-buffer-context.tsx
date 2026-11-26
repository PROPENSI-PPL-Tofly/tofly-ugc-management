"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_BUFFER_DAYS } from "@/lib/deadline-buffer";

// The buffer the admin area was rendered with, read once by the admin layout and handed to every
// date picker below it (Tambah Creator, Perpanjang Kontrak, Tambah Konten) without each trigger
// passing it down. A save refreshes the route, so the layout reads the new value and every picker
// follows.
const DeadlineBufferContext = createContext<number>(DEFAULT_BUFFER_DAYS);

export function DeadlineBufferProvider({
  bufferDays,
  children,
}: Readonly<{ bufferDays: number; children: ReactNode }>) {
  return <DeadlineBufferContext value={bufferDays}>{children}</DeadlineBufferContext>;
}

/** The buffer in force; the default outside the admin area, where no picker is drawn. */
export function useDeadlineBuffer(): number {
  return useContext(DeadlineBufferContext);
}
