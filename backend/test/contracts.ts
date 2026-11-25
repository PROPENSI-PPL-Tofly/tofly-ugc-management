import { day } from './days.js';

/**
 * A contract running from 30 days ago to 30 days ahead. Access follows the contracts (PRD Sprint 4,
 * rule 1), so a creator a suite signs in needs one; nested under `contracts: { create: ... }`.
 */
export function runningContract() {
  return {
    start_date: day(-30),
    end_date: day(30),
    contract_type: 'regular' as const,
    days_between: 14,
    content_quota: 1,
    fixed_rate: 1_000_000,
  };
}
