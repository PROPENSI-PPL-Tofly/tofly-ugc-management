// Server-side only: the numbers behind the creator dashboard's stat cards. It reads the tasks
// API through fetchMyTasks, which carries the browser's session, so it lives apart from the
// shared creator-dashboard module that client components may import.

import { STAT_CARDS } from "./creator-dashboard";
import { jakartaDay } from "./format";
import {
  DEFAULT_MY_TASKS_PARAMS,
  TASK_STATUS_FILTERS,
  type TaskStatusFilter,
} from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";

/** Everything not finished yet: the statuses a deadline is still open in. */
const OPEN_STATUSES = TASK_STATUS_FILTERS.filter((status) => status !== "link_submitted");

export interface CreatorDashboard {
  /** Tasks per stat card status. */
  counts: Partial<Record<TaskStatusFilter, number>>;
  /** The nearest deadline still open, as a calendar day; null when nothing is open. */
  nearestDeadline: string | null;
}

/**
 * One round of requests: each card's status for its total, and the unfinished tasks for the
 * nearest deadline. Finished tasks are left out of that request by name, so its first row is
 * the nearest open deadline whatever order the API gives finished work, and none means nothing
 * is open at all.
 */
export async function fetchCreatorDashboard(): Promise<CreatorDashboard> {
  const today = jakartaDay();
  const only = (status: readonly TaskStatusFilter[]) =>
    fetchMyTasks({ ...DEFAULT_MY_TASKS_PARAMS, status: [...status] }, today);

  const [open, ...perStatus] = await Promise.all([
    only(OPEN_STATUSES),
    ...STAT_CARDS.map((card) => only([card.status])),
  ]);

  return {
    counts: Object.fromEntries(
      STAT_CARDS.map((card, index) => [card.status, perStatus[index].total]),
    ),
    nearestDeadline: open.items[0]?.deadline ?? null,
  };
}
