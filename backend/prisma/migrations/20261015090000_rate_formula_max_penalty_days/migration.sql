-- Maks hari penalti (PBI-8, Subtask 8.2): the most days one late content is penalised for, set in
-- the Atur Formula Rate modal beside the daily penalty. The invoice calculation (Subtask 8.3)
-- multiplies the daily penalty by the days late, capped at this.
--
-- Whole days from 0 to 365. The column is nullable only so a formula saved before it existed
-- stays valid: GET answers it as null, never as 0, and the next save must set it. The validator
-- rejects everything else first; the constraint holds the same rule for any writer that skips it.
--
-- Unconstrained numeric rather than integer, like the other formula amounts (see
-- 20261014160000_rate_formula_exact_amounts): an integer column rounds what it is given (3.5
-- becomes 4) before any check sees it, so a fractional write that skipped the validator would be
-- rounded instead of refused. numeric stores the value as written, so the check can refuse it.
alter table rate_formula
  add column max_penalty_days numeric,
  add constraint rate_formula_max_penalty_days_check
    check (max_penalty_days between 0 and 365 and max_penalty_days = trunc(max_penalty_days));
