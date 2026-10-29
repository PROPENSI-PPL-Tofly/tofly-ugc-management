-- Invoice payments (PBI-13): the steps after finalizing, the payment proof an admin uploads,
-- and the comment thread both sides write in at every stage.
--
-- The pipeline goes on after 'finalized': the creator acknowledges, the admin uploads the
-- proof, the creator confirms receipt. IF NOT EXISTS keeps this safe to meet a sibling
-- migration adding the same values. A value added here cannot be used in this same
-- transaction, so nothing below names one.
alter type invoice_status add value if not exists 'creator_acked';
alter type invoice_status add value if not exists 'payment_uploaded';
alter type invoice_status add value if not exists 'paid';

-- Every status after running keeps the snapshot it was finalized with.
alter table invoices drop constraint invoices_finalized_snapshot_check;
alter table invoices add constraint invoices_finalized_snapshot_check check (
  (status = 'running' and finalized_at is null and snapshot is null)
  or (status <> 'running' and finalized_at is not null and snapshot is not null)
);

-- One proof per invoice. The file lives in object storage under object_key, a random UUID, so
-- nothing the admin typed ever becomes a storage path; file_name is only for display.
create table invoice_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references invoices(id) on delete cascade on update no action,
  object_key uuid not null unique,
  file_name varchar(255) not null,
  content_type text not null,
  size_bytes integer not null,
  -- No action, not restrict: a creator's deletion cascades the invoice away first, while an
  -- admin who uploaded a proof cannot be deleted from under it.
  uploaded_by uuid not null references users(id) on delete no action on update no action,
  uploaded_at timestamptz(6) not null default now(),
  constraint invoice_payment_proofs_file_name_check check (length(btrim(file_name)) > 0),
  constraint invoice_payment_proofs_content_type_check check (
    content_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint invoice_payment_proofs_size_check check (size_bytes between 1 and 5242880)
);

create index invoice_payment_proofs_uploaded_by_idx on invoice_payment_proofs(uploaded_by);

-- The thread of one invoice, read oldest first.
create table invoice_comments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade on update no action,
  author_user_id uuid not null references users(id) on delete no action on update no action,
  author_role text not null,
  text varchar(500) not null,
  created_at timestamptz(6) not null default now(),
  constraint invoice_comments_author_role_check check (author_role in ('admin', 'creator')),
  constraint invoice_comments_text_check check (length(btrim(text)) > 0)
);

create index invoice_comments_invoice_created_idx
  on invoice_comments(invoice_id, created_at, id);
create index invoice_comments_author_user_idx on invoice_comments(author_user_id);

alter table invoice_payment_proofs enable row level security;
alter table invoice_comments enable row level security;
revoke all on invoice_payment_proofs from anon, authenticated;
revoke all on invoice_comments from anon, authenticated;
