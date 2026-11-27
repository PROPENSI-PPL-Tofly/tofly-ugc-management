// Server-side only: GET /admin/dashboard on the signed-in admin's behalf. It reads the
// session through backendGet, so it lives apart from the pure executive-dashboard module that
// the client charts import.

import { backendGet } from "./backend.server";
import {
  EXECUTIVE_DASHBOARD_PATH,
  ExecutiveDashboardError,
  coversRange,
  reshapeExecutiveAnswer,
  toDashboardApiQuery,
  toExecutiveDashboard,
  type DashboardState,
  type ExecutiveDashboard,
} from "./executive-dashboard";

const UNUSABLE_ANSWER = 502;

/** One load of the page: the charts and table, the KPI block for 24.2's cards, and the months shown. */
export interface ExecutiveAnswer extends ExecutiveDashboard {
  /** Unchecked here: toExecutiveKpis checks it card by card, so one bad figure fails one card. */
  kpis: unknown;
  period: { from: string; to: string } | null;
}

/**
 * The charts' months, Performa Creator's rows and the KPI block for the page's range, in one request. Only the range travels;
 * the backend decides who may see it from the forwarded session (OWASP A01). A refusal keeps
 * its status so the page can tell "signed out" from "failed"; a 200 it cannot read is a 502,
 * and so is one whose months do not cover the range asked for, one after another, since a
 * missing month would close up the charts' axis without a word (OWASP A08).
 */
export async function fetchExecutiveDashboard(state: DashboardState): Promise<ExecutiveAnswer> {
  const response = await backendGet(`${EXECUTIVE_DASHBOARD_PATH}?${toDashboardApiQuery(state)}`);

  if (!response.ok) throw new ExecutiveDashboardError(response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ExecutiveDashboardError(UNUSABLE_ANSWER);
  }

  const { charts, kpis, period } = reshapeExecutiveAnswer(body);
  const dashboard = toExecutiveDashboard(charts);
  if (!coversRange(dashboard.months, state.months)) throw new ExecutiveDashboardError(UNUSABLE_ANSWER);

  return { ...dashboard, kpis, period };
}
