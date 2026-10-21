"use client";

import type { ReactNode } from "react";

/** What the pager control is told: where the page sits in the list, and how to turn it. */
export interface PagerProps {
  /** The navigation's accessible name. */
  label: string;
  /** What a row is, for the arrows' names ("Task overdue berikutnya"). */
  noun: string;
  page: number;
  pages: number;
  first: number;
  last: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

/** Stub until paging lands: draws nothing, so the tests that pin it run and fail. */
export function Pager(props: Readonly<PagerProps>) {
  void props;
  return null;
}

/** Stub until paging lands: always the phone size. */
export function usePageSize(phone: number, wide: number): number {
  void wide;
  return phone;
}

/** Stub until paging lands: every row at once, with no pager. */
export function PagedList({
  children,
}: Readonly<{ label: string; noun: string; phone: number; wide: number; children: ReactNode[] }>) {
  return <ul>{children}</ul>;
}
