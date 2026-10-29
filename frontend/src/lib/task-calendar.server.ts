// Server-side only: every task of the signed-in creator, for the Task Saya calendar. The table
// reads one small page; a month needs them all. It goes through fetchMyTasks, which carries the
// browser's session, so it lives apart from the task-calendar module client code imports.

import type { MyTask, MyTasksCounts, MyTasksParams } from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";

/** The most rows GET /me/contents hands out in one request. */
export const CALENDAR_PAGE_SIZE = 50;

export interface AllMyTasks {
  tasks: MyTask[];
  /** Every tab's size under the search and filters, for the tabs above the calendar. */
  counts: MyTasksCounts;
}

/**
 * Every task of the open tab under the search and filters, whatever page the address names.
 * Reads the first page, which says how many there are, then the rest together. Most creators
 * fit in one request. A failure on any page fails the whole read: a calendar missing some of
 * its tasks would look complete and be wrong.
 */
export async function fetchAllMyTasks(state: MyTasksParams, today: string): Promise<AllMyTasks> {
  const page = (number: number) =>
    fetchMyTasks({ ...state, page: number }, today, CALENDAR_PAGE_SIZE);

  const first = await page(1);

  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => page(index + 2)),
  );

  return { tasks: [first, ...rest].flatMap((answer) => answer.items), counts: first.counts };
}
