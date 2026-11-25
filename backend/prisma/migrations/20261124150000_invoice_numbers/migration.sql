-- Document numbers (PBI-31): TOF-INV-YYYYMM-NNN when the creator acknowledges the invoice, the day
-- it is issued (no adjustment can change it after), and TOF-RCP-YYYYMM-NNN when the creator
-- confirms the payment arrived. YYYYMM is the Jakarta month of that moment and NNN counts that
-- month's documents of the kind from 001. A counter row per kind and month hands the next number
-- out under its own row lock, so two moves at once never take the same number, and a move that
-- rolls back takes none.

create table document_number_counters (
  kind text not null check (kind in ('invoice', 'receipt')),
  month char(6) not null check (month ~ '^[0-9]{6}$'),
  last_number integer not null check (last_number > 0),
  primary key (kind, month)
);

-- Backend-only, as every app table: no API role may read or write it (data-api-access e2e).
alter table document_number_counters enable row level security;

alter table invoices
  add column invoice_number text,
  add column receipt_number text;

-- Invoices acknowledged before numbers existed get theirs by the moment of the move, oldest first.
-- A paid or proof-uploaded invoice was acknowledged before it, so it always has one; an earlier
-- moment stands in only for a row saved before the moment was recorded.
with issued as (
  select id, coalesce(acknowledged_at, finalized_at, (snapshot ->> 'finalizedAt')::timestamptz, created_at) as at
  from invoices
  where status in ('creator_acked', 'payment_uploaded', 'paid')
),
numbered as (
  select id, to_char(at at time zone 'Asia/Jakarta', 'YYYYMM') as month,
    row_number() over (partition by to_char(at at time zone 'Asia/Jakarta', 'YYYYMM') order by at, id) as n
  from issued
)
update invoices
set invoice_number = 'TOF-INV-' || numbered.month || '-' ||
  case when numbered.n < 1000 then lpad(numbered.n::text, 3, '0') else numbered.n::text end
from numbered
where invoices.id = numbered.id;

with settled as (
  select id, coalesce(paid_at, acknowledged_at, finalized_at, created_at) as at
  from invoices
  where status = 'paid'
),
numbered as (
  select id, to_char(at at time zone 'Asia/Jakarta', 'YYYYMM') as month,
    row_number() over (partition by to_char(at at time zone 'Asia/Jakarta', 'YYYYMM') order by at, id) as n
  from settled
)
update invoices
set receipt_number = 'TOF-RCP-' || numbered.month || '-' ||
  case when numbered.n < 1000 then lpad(numbered.n::text, 3, '0') else numbered.n::text end
from numbered
where invoices.id = numbered.id;

insert into document_number_counters (kind, month, last_number)
select 'invoice', substring(invoice_number from 9 for 6), max(substring(invoice_number from 16)::integer)
from invoices where invoice_number is not null group by 2
union all
select 'receipt', substring(receipt_number from 9 for 6), max(substring(receipt_number from 16)::integer)
from invoices where receipt_number is not null group by 2;

alter table invoices
  add constraint invoices_invoice_number_key unique (invoice_number),
  add constraint invoices_receipt_number_key unique (receipt_number),
  add constraint invoices_invoice_number_format check (
    invoice_number is null or invoice_number ~ '^TOF-INV-[0-9]{6}-[0-9]{3,}$'
  ),
  add constraint invoices_receipt_number_format check (
    receipt_number is null or receipt_number ~ '^TOF-RCP-[0-9]{6}-[0-9]{3,}$'
  ),
  -- Issued once the creator acknowledged it, never before.
  add constraint invoices_invoice_number_when_issued check (
    (status in ('creator_acked', 'payment_uploaded', 'paid')) = (invoice_number is not null)
  ),
  -- A receipt exists for a paid invoice only.
  add constraint invoices_receipt_number_when_paid check (
    (status = 'paid') = (receipt_number is not null)
  );
