import type { content_status } from '@prisma/client';

/** The values a Task Saya row is ordered by. */
export interface TaskOrder {
  id: string;
  name: string;
  /** ISO calendar day. */
  deadline: string;
  status: content_status;
}

/** Work still to do comes first; a submitted link needs nothing more from the creator. */
function rank(task: TaskOrder): number {
  return task.status === 'link_submitted' ? 1 : 0;
}

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * Open tasks before submitted ones, then nearest deadline (ISO days sort as strings), then
 * name and id so rows sharing a deadline keep their place from one page to the next.
 */
export function compareMyTasks(a: TaskOrder, b: TaskOrder): number {
  return (
    rank(a) - rank(b) ||
    compareText(a.deadline, b.deadline) ||
    compareText(a.name, b.name) ||
    compareText(a.id, b.id)
  );
}
