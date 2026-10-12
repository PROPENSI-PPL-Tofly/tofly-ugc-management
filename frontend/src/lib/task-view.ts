// Which way Task Saya shows its tasks (PBI-7, subtask 7.3): the table, or the month calendar.
// The view lives in the address, like the rest of this page's filters, so it can be linked,
// bookmarked and reloaded. The month the calendar is turned to is not in the address: it is
// kept by the calendar itself and starts again from today.

import { MY_TASKS_BASE, buildMyTasksQuery, type MyTasksParams } from "./my-tasks";

export type TaskView = "table" | "calendar";

/** The two views in the order the switch offers them. */
export const TASK_VIEWS: readonly { key: TaskView; label: string }[] = [
  { key: "table", label: "Tabel" },
  { key: "calendar", label: "Kalender" },
];

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
 * The view as the parameters that keep it open: none for the table, which is what the bare
 * address shows. For a control that rebuilds the query and must not close the calendar.
 */
export function taskViewParams(view: TaskView): Record<string, string> {
  return view === DEFAULT_VIEW ? {} : { [VIEW_PARAM]: view };
}

/**
 * Where a view's button leads. The tab, the search and the filters come along; the page number
 * does not, since a page of the table means nothing on the calendar and the other way round.
 */
export function taskViewHref(view: TaskView, state: MyTasksParams): string {
  const search = new URLSearchParams({
    ...buildMyTasksQuery({ ...state, page: 1 }),
    ...taskViewParams(view),
  }).toString();

  return search ? `${MY_TASKS_BASE}?${search}` : MY_TASKS_BASE;
}
