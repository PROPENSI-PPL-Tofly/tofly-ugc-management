-- 20261014140000_rate_formula_prototype_rules made the formula amounts and tier values integer
-- columns. An integer column rounds what it is given (1.5 becomes 2) before any check
-- constraint sees it, so a fractional write that skipped the validator was silently rounded
-- instead of refused.
--
-- The columns become unconstrained numeric, which stores the value exactly as written, so the
-- checks can see a fraction and refuse it. Not numeric(p, s): that rounds to its scale first,
-- so 1.001 would become 1.00 and pass. The checks still hold the prototype's ranges, which also
-- refuse NaN and infinity, as Postgres orders them past every number.
--
-- integer to numeric is exact, so no saved amount changes. The constraints are dropped and added
-- back under the same names, with the whole-number rule added. The unique index on (platform,
-- threshold) and the foreign key to performance_bonus_metrics are kept through the type change.
alter table rate_formula
  drop constraint rate_formula_specific_bonus_check,
  drop constraint rate_formula_late_penalty_per_day_check,
  alter column specific_bonus type numeric using specific_bonus::numeric,
  alter column late_penalty_per_day type numeric using late_penalty_per_day::numeric,
  add constraint rate_formula_specific_bonus_check
    check (specific_bonus between 0 and 10000000 and specific_bonus = trunc(specific_bonus)),
  add constraint rate_formula_late_penalty_per_day_check
    check (late_penalty_per_day between 0 and 1000000
           and late_penalty_per_day = trunc(late_penalty_per_day));

alter table performance_bonus_tiers
  drop constraint performance_bonus_tiers_threshold_check,
  drop constraint performance_bonus_tiers_bonus_check,
  alter column threshold type numeric using threshold::numeric,
  alter column bonus type numeric using bonus::numeric,
  add constraint performance_bonus_tiers_threshold_check
    check (threshold between 1 and 999999999 and threshold = trunc(threshold)),
  add constraint performance_bonus_tiers_bonus_check
    check (bonus between 1 and 999999999 and bonus = trunc(bonus));
