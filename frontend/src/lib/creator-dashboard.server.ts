// Server-side only: the numbers behind the creator dashboard's stat cards. It reads the tasks
// API through fetchMyTasks, which carries the browser's session, so it lives apart from the
// shared creator-dashboard module that client components may import.

import {
  AGENDA_ROWS,
  OPEN_STATUSES,
  STAT_CARDS,
  overdueParams,
  upcomingParams,
  type DeadlineList,
} from "./creator-dashboard";
import { jakartaDay } from "./format";
import { DEFAULT_MY_TASKS_PARAMS, type MyTasksResponse, type TaskStatusFilter } from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";

function listOf({ items, total }: MyTasksResponse): DeadlineList {
  return { items, total };
}

export interface CreatorDashboard {
  /** Tasks per stat card status. */
  counts: Partial<Record<TaskStatusFilter, number>>;
  /** The nearest deadline still open, as a calendar day; null when nothing is open. */
  nearestDeadline: string | null;
  /** Unfinished work flagged overdue, nearest first. */
  overdue: DeadlineList;
  /** Unfinished work due in the next UPCOMING_DAYS, nearest first, overdue work left out. */
  upcoming: DeadlineList;
}

/**
 * One round of requests: each card's status for its total, the unfinished tasks for the nearest
 * deadline, and the two deadline lists, which the API narrows itself so their totals hold across
 * every page. Finished tasks are left out of that request by name, so its first row is
 * the nearest open deadline whatever order the API gives finished work, and none means nothing
 * is open at all.
 */
export async function fetchCreatorDashboard(): Promise<CreatorDashboard> {
  const today = jakartaDay();
  const only = (status: readonly TaskStatusFilter[]) =>
    fetchMyTasks({ ...DEFAULT_MY_TASKS_PARAMS, status: [...status] }, today);

  const [overdue, upcoming, open, ...perStatus] = await Promise.all([
    fetchMyTasks(overdueParams(), today, AGENDA_ROWS),
    fetchMyTasks(upcomingParams(today), today, AGENDA_ROWS),
    only(OPEN_STATUSES),
    ...STAT_CARDS.map((card) => only([card.status])),
  ]);

  return {
    counts: Object.fromEntries(
      STAT_CARDS.map((card, index) => [card.status, perStatus[index].total]),
    ),
    nearestDeadline: open.items[0]?.deadline ?? null,
    overdue: listOf(overdue),
    upcoming: listOf(upcoming),
  };
}
