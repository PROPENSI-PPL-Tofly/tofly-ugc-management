// Server-side only: GET /dashboard/executive on the signed-in admin's behalf. It reads the
// session through backendGet, so it lives apart from the pure executive-dashboard module that
// the client charts import.

import { backendGet } from "./backend.server";
import {
  EXECUTIVE_DASHBOARD_PATH,
  ExecutiveDashboardError,
  coversRange,
  toDashboardApiQuery,
  toExecutiveDashboard,
  type DashboardState,
  type ExecutiveDashboard,
} from "./executive-dashboard";

const UNUSABLE_ANSWER = 502;

/**
 * The charts' months and Performa Creator's rows for the page's range. Only the range travels;
 * the backend decides who may see it from the forwarded session (OWASP A01). A refusal keeps
 * its status so the page can tell "signed out" from "failed"; a 200 it cannot read is a 502,
 * and so is one whose months do not cover the range asked for, one after another, since a
 * missing month would close up the charts' axis without a word (OWASP A08).
 */
export async function fetchExecutiveDashboard(state: DashboardState): Promise<ExecutiveDashboard> {
  const response = await backendGet(`${EXECUTIVE_DASHBOARD_PATH}?${toDashboardApiQuery(state)}`);

  if (!response.ok) throw new ExecutiveDashboardError(response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ExecutiveDashboardError(UNUSABLE_ANSWER);
  }

  const dashboard = toExecutiveDashboard(body);
  if (!coversRange(dashboard.months, state.months)) throw new ExecutiveDashboardError(UNUSABLE_ANSWER);

  return dashboard;
}
