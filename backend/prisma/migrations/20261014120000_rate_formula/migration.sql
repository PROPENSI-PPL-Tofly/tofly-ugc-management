-- The Atur Formula Rate settings (PBI-8, Subtask 8.1): one formula shared by every creator, and up
-- to five performance bonus tiers per platform. The content fee is not here: it stays each
-- contract's contracts.fixed_rate.
--
-- Amounts are numeric(12, 2): ten digits before the point and two after. That is a provisional
-- limit for the formula; contracts.fixed_rate allows twelve. The tier threshold uses the same
-- type until the performance calculation (PBI-19) settles what it counts and in which unit.
--
-- The validator rejects all of this first; the constraints hold the same rules for any writer
-- that skips it.

-- One row only: the primary key is a boolean that can only be true.
create table rate_formula (
  id boolean primary key default true,
  specific_bonus numeric(12, 2) not null,
  late_penalty_per_day numeric(12, 2) not null,
  updated_by uuid references users(id) on delete set null on update no action,
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now(),
  constraint rate_formula_singleton_check check (id),
  constraint rate_formula_specific_bonus_check check (specific_bonus >= 0),
  constraint rate_formula_late_penalty_per_day_check check (late_penalty_per_day >= 0)
);

-- A platform's tiers, numbered 1 to 5 in threshold order.
create table performance_bonus_tiers (
  platform social_platform not null,
  position integer not null,
  threshold numeric(12, 2) not null,
  bonus numeric(12, 2) not null,
  primary key (platform, position),
  constraint performance_bonus_tiers_position_check check (position between 1 and 5),
  constraint performance_bonus_tiers_threshold_check check (threshold >= 0),
  constraint performance_bonus_tiers_bonus_check check (bonus >= 0)
);

alter table rate_formula enable row level security;
alter table performance_bonus_tiers enable row level security;

revoke all on rate_formula from anon, authenticated;
revoke all on performance_bonus_tiers from anon, authenticated;
