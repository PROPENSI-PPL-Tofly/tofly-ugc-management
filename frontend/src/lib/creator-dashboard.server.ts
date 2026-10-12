// Server-side only: the numbers behind the creator dashboard's stat cards. It reads the tasks
// API through fetchMyTasks, which carries the browser's session, so it lives apart from the
// shared creator-dashboard module that client components may import.

import { STAT_CARDS } from "./creator-dashboard";
import type { TaskStatusFilter } from "./my-tasks";
import { fetchMyTasks } from "./my-tasks.server";

export interface CreatorDashboard {
  /** Tasks per stat card status. */
  counts: Partial<Record<TaskStatusFilter, number>>;
  /** The nearest deadline still open, as a calendar day; null when nothing is open. */
  nearestDeadline: string | null;
}

/**
 * One round of requests: each card's status for its total, and the first page of the whole
 * list for the nearest deadline. The API lists open work first by nearest deadline, so the
 * first row is the one, unless it is already finished and nothing is open at all.
 */
export async function fetchCreatorDashboard(): Promise<CreatorDashboard> {
  const [all, ...perStatus] = await Promise.all([
    fetchMyTasks(1),
    ...STAT_CARDS.map((card) => fetchMyTasks(1, card.status)),
  ]);

  const first = all.items[0];

  return {
    counts: Object.fromEntries(
      STAT_CARDS.map((card, index) => [card.status, perStatus[index].total]),
    ),
    nearestDeadline: first && first.status !== "link_submitted" ? first.deadline : null,
  };
}
