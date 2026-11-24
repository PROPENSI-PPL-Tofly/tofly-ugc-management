-- PBI-37 (37.1): "Akhiri Kontrak Lebih Awal". The early end lives on the contract, not on the
-- creator: end_date becomes the last day, so every reader of the period (status, Finalize,
-- penalties, the overlap check of Perpanjang Kontrak) follows it, and original_end_date keeps the
-- end it had before.
create type contract_end_reason as enum ('breach', 'fraud', 'other');

alter table contracts
  add column original_end_date date,
  add column end_reason contract_end_reason,
  add column end_note varchar(500),
  add column ended_at timestamptz(6),
  add column ended_by uuid references users (id) on delete no action on update no action;

-- An early end is recorded whole or not at all, never moves the end later, and always says why.
-- ended_by stays optional: the local development stand-in signs in no admin.
alter table contracts add constraint contracts_early_end_check check (
  (
    original_end_date is null
    and end_reason is null
    and end_note is null
    and ended_at is null
    and ended_by is null
  )
  or (
    original_end_date is not null
    and end_reason is not null
    and ended_at is not null
    and end_date <= original_end_date
    and length(btrim(end_note)) between 1 and 500
  )
);

create index contracts_ended_by_idx on contracts (ended_by);

-- Content due after the last day is closed rather than deleted, so its history stays.
alter table contents add column closed_at timestamptz(6);

-- A cancelled invoice says when and by whom; no other status carries a cancellation.
alter table invoices
  add column cancelled_at timestamptz(6),
  add column cancelled_by uuid references users (id) on delete no action on update no action;

alter table invoices add constraint invoices_cancelled_check check (
  (status = 'cancelled') = (cancelled_at is not null)
);

create index invoices_cancelled_by_idx on invoices (cancelled_by);
