-- Invoice status flow (PBI-13, 13.1): every move keeps who made it and when. The payment proof
-- keeps uploaded_by and uploaded_at (13.2); finalizing kept only finalized_at (PBI-12) and now
-- keeps the admin too; the creator's acknowledge and receipt confirmation are kept here.
--
-- The statuses named below were added by 20261020120000, an earlier migration, so they are
-- committed and usable here.
alter table invoices
  -- Null on an invoice finalized before this migration, whose admin was never recorded.
  add column finalized_by uuid references users(id) on delete no action on update no action,
  add column acknowledged_at timestamptz(6),
  add column acknowledged_by uuid references users(id) on delete no action on update no action,
  add column paid_at timestamptz(6),
  add column paid_by uuid references users(id) on delete no action on update no action;

-- A status past a move holds that move's actor and time; a status before it holds neither, so
-- no code path can skip a step or forget who took it.
alter table invoices add constraint invoices_acknowledged_check check (
  (
    status in ('running', 'finalized')
    and acknowledged_at is null and acknowledged_by is null
  )
  or (
    status in ('creator_acked', 'payment_uploaded', 'paid')
    and acknowledged_at is not null and acknowledged_by is not null
  )
);

alter table invoices add constraint invoices_paid_check check (
  (status <> 'paid' and paid_at is null and paid_by is null)
  or (status = 'paid' and paid_at is not null and paid_by is not null)
);

create index invoices_finalized_by_idx on invoices(finalized_by);
create index invoices_acknowledged_by_idx on invoices(acknowledged_by);
create index invoices_paid_by_idx on invoices(paid_by);
