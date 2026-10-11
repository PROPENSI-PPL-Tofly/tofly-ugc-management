// Server-side only: every task of the signed-in creator, for the Task Saya calendar. The table
// reads one small page; a month needs them all. It goes through fetchMyTasks, which carries the
// browser's session, so it lives apart from the task-calendar module client code imports.

import type { MyTask, TaskStatusFilter } from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";

/** The most rows GET /me/contents hands out in one request. */
export const CALENDAR_PAGE_SIZE = 50;

/**
 * Reads the first page, which says how many there are, then the rest together. Most creators
 * fit in one request. A failure on any page fails the whole read: a calendar missing some of
 * its tasks would look complete and be wrong.
 */
export async function fetchAllMyTasks(status: TaskStatusFilter | null): Promise<MyTask[]> {
  const first = await fetchMyTasks(1, status, CALENDAR_PAGE_SIZE);

  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) =>
      fetchMyTasks(index + 2, status, CALENDAR_PAGE_SIZE),
    ),
  );

  return [first, ...rest].flatMap((page) => page.items);
}
