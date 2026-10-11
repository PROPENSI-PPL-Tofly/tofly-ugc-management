// Which way Task Saya shows its tasks (PBI-7, subtask 7.3): the table, or the month calendar.
// The address is the only state, as everywhere on this page, so a view can be linked,
// bookmarked and reloaded.

import type { TaskStatusFilter } from "./my-tasks";

export type TaskView = "table" | "calendar";

/** The two views in the order the switch offers them. */
export const TASK_VIEWS: readonly { key: TaskView; label: string }[] = [
  { key: "table", label: "Tabel" },
  { key: "calendar", label: "Kalender" },
];

const TASKS_PATH = "/creator/tasks";
const VIEW_PARAM = "view";
const DEFAULT_VIEW: TaskView = "table";

/**
 * The view the address asks for. Anything but the calendar's exact name shows the table, so a
 * mistyped or tampered value can never leave the creator on a broken page (OWASP A03).
 */
export function parseTaskView(params: Record<string, string | string[] | undefined>): TaskView {
  const raw = Array.isArray(params[VIEW_PARAM]) ? params[VIEW_PARAM][0] : params[VIEW_PARAM];

  return raw === "calendar" ? "calendar" : DEFAULT_VIEW;
}

/**
 * Where a view's button leads. The status filter comes along; the page number does not, since
 * a page of the table means nothing on the calendar and the other way round.
 */
export function taskViewHref(view: TaskView, status: TaskStatusFilter | null): string {
  const query = new URLSearchParams();

  if (status) query.set("status", status);
  if (view !== DEFAULT_VIEW) query.set(VIEW_PARAM, view);

  const search = query.toString();

  return search ? `${TASKS_PATH}?${search}` : TASKS_PATH;
}
