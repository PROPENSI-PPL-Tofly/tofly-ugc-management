-- A starting rate formula, so a new environment can calculate invoices before an admin has opened
-- Atur Formula Rate. These are placeholder figures, not agreed business rates: an admin should
-- review them there. Run by prisma/ops/seed-environment.sh on every deploy, it only fills an empty
-- environment, so a formula saved in the app is never replaced. The content fee is not here; it
-- stays each contract's fixed_rate.

\set ON_ERROR_STOP on

select exists (select 1 from rate_formula) as formula_present \gset

\if :formula_present
  \echo 'rate formula already present: nothing to do'
\else
  begin;

  insert into rate_formula (specific_bonus, late_penalty_per_day, max_penalty_days)
  values (150000, 25000, 7);

  insert into performance_bonus_metrics (platform, metric)
  values ('instagram', 'views'), ('tiktok', 'views');

  insert into performance_bonus_tiers (platform, position, threshold, bonus) values
    ('instagram', 1,   10000,  50000),
    ('instagram', 2,   50000, 150000),
    ('instagram', 3,  100000, 300000),
    ('instagram', 4,  500000, 750000),
    ('tiktok',    1,   50000,  50000),
    ('tiktok',    2,  100000, 150000),
    ('tiktok',    3,  500000, 300000),
    ('tiktok',    4, 1000000, 750000);

  commit;
  \echo 'rate formula loaded'
\endif
