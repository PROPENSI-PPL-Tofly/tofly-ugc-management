-- Aligns the Atur Formula Rate tables (PBI-8, Subtask 8.1) with the Tofly Module 1 prototype:
--   Bonus Specific: whole rupiah, Rp0 to Rp10.000.000
--   Penalti per hari: whole rupiah, Rp0 to Rp1.000.000
--   per platform: one metric (views, likes, comments, shares) and its tiers, each tier's minimum
--     and bonus whole and between 1 and 999.999.999, minimums distinct, and no cap on how many.
-- That the bonus rises with the minimum is the validator's rule only.
--
-- 20261014120000_rate_formula is left as it was; this changes its tables. The guard stops the
-- migration if a saved amount is not whole, since the change to integer would otherwise round it
-- without anyone noticing. A saved amount out of range, or a saved tier with no metric to belong
-- to, stops it too, through the constraints added below.
do $$
begin
  if exists (
    select 1 from rate_formula
    where specific_bonus <> trunc(specific_bonus)
       or late_penalty_per_day <> trunc(late_penalty_per_day)
  ) or exists (
    select 1 from performance_bonus_tiers
    where threshold <> trunc(threshold) or bonus <> trunc(bonus)
  ) then
    raise exception 'rate_formula or performance_bonus_tiers has amounts that are not whole; fix them before this migration';
  end if;
end
$$;

create type performance_metric as enum ('views', 'likes', 'comments', 'shares');

-- What a platform's tier minimums count: one row per platform.
create table performance_bonus_metrics (
  platform social_platform primary key,
  metric performance_metric not null
);

alter table rate_formula
  drop constraint rate_formula_specific_bonus_check,
  drop constraint rate_formula_late_penalty_per_day_check,
  alter column specific_bonus type integer using specific_bonus::integer,
  alter column late_penalty_per_day type integer using late_penalty_per_day::integer,
  add constraint rate_formula_specific_bonus_check
    check (specific_bonus between 0 and 10000000),
  add constraint rate_formula_late_penalty_per_day_check
    check (late_penalty_per_day between 0 and 1000000);

-- A platform's tiers, numbered from 1 in minimum order. Removing a platform's metric removes its
-- tiers, as changing the metric in the prototype clears them.
alter table performance_bonus_tiers
  drop constraint performance_bonus_tiers_position_check,
  drop constraint performance_bonus_tiers_threshold_check,
  drop constraint performance_bonus_tiers_bonus_check,
  alter column threshold type integer using threshold::integer,
  alter column bonus type integer using bonus::integer,
  add constraint performance_bonus_tiers_position_check check (position >= 1),
  add constraint performance_bonus_tiers_threshold_check
    check (threshold between 1 and 999999999),
  add constraint performance_bonus_tiers_bonus_check
    check (bonus between 1 and 999999999),
  add constraint performance_bonus_tiers_platform_fkey foreign key (platform)
    references performance_bonus_metrics (platform) on delete cascade on update no action;

create unique index performance_bonus_tiers_platform_threshold_key
  on performance_bonus_tiers (platform, threshold);

alter table performance_bonus_metrics enable row level security;

revoke all on performance_bonus_metrics from anon, authenticated;
