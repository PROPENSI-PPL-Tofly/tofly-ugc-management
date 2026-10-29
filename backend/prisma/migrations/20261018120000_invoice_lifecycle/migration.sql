-- Invoice lifecycle and manual adjustments are separate from the live calculation.
create type invoice_status as enum ('running', 'finalized');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references contracts(id) on delete cascade on update no action,
  status invoice_status not null default 'running',
  created_at timestamptz(6) not null default now()
);

create index invoices_status_idx on invoices(status);

create table invoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade on update no action,
  amount numeric not null,
  reason varchar(500) not null,
  actor_user_id uuid not null references users(id) on delete restrict on update no action,
  created_at timestamptz(6) not null default now(),
  constraint invoice_adjustments_amount_check check (
    amount <> 0 and amount = trunc(amount, 2)
  ),
  constraint invoice_adjustments_reason_check check (length(btrim(reason)) > 0)
);

create index invoice_adjustments_invoice_created_idx
  on invoice_adjustments(invoice_id, created_at, id);
create index invoice_adjustments_actor_user_idx
  on invoice_adjustments(actor_user_id);

alter table invoices enable row level security;
alter table invoice_adjustments enable row level security;
revoke all on invoices from anon, authenticated;
revoke all on invoice_adjustments from anon, authenticated;
