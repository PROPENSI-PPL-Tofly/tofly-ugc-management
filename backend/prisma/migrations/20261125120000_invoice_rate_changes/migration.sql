-- PBI-16 (16.1): every change of a contract's fixed rate while its invoice runs, for the invoice's
-- "Aktivitas". The invoice itself reads contracts.fixed_rate live, so this table is history only.
create table invoice_rate_changes (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null
    references invoices(id) on delete cascade on update no action,
  -- A contract from before the form refused zero may start from 0.
  old_rate      numeric(12, 2) not null check (old_rate >= 0),
  new_rate      numeric(12, 2) not null check (new_rate > 0),
  -- The admin who changed it; null behind the local development stand-in.
  actor_user_id uuid references users(id) on delete no action on update no action,
  created_at    timestamptz(6) not null default now(),
  check (old_rate <> new_rate)
);

create index invoice_rate_changes_invoice_created_idx
  on invoice_rate_changes (invoice_id, created_at, id);

create index invoice_rate_changes_actor_user_idx
  on invoice_rate_changes (actor_user_id);

-- The backend alone reads or writes it, as the invoice's other tables.
alter table invoice_rate_changes enable row level security;
revoke all on table invoice_rate_changes from anon, authenticated;
