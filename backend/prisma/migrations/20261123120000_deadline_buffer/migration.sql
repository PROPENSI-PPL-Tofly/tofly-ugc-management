-- The deadline buffer (PBI-23 AC 20-22, SCRUM-298): one value, in whole days, that draws both
-- deadline lines (max(contract start, today) + buffer, and contract end - buffer). A Super Admin
-- changes it; it starts at 5, the value the H-5 rule and the earliest-deadline rule used before.
--
-- The API refuses anything else first; the constraints hold the same rules for any writer that
-- skips it (OWASP A06:2025).

-- One row only: the primary key is a boolean that can only be true, as rate_formula.
create table deadline_buffer (
  id boolean primary key default true,
  buffer_days integer not null default 5,
  updated_by uuid references users(id) on delete set null on update no action,
  updated_at timestamptz(6) not null default now(),
  constraint deadline_buffer_singleton_check check (id),
  constraint deadline_buffer_days_check check (buffer_days between 1 and 14)
);

-- Present from the start, so every deadline rule reads a stored value.
insert into deadline_buffer default values;
