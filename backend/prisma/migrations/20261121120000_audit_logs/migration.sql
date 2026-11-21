-- PBI-23 (SCRUM-295): "Log Aktivitas". Each row is a copy of who did what to what at that moment,
-- so it has no foreign key: a later change to a user, creator or contract can never rewrite or
-- remove history, and accounts or demo data going away leave the row as it was.
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz(6) not null default now(),
  -- Null when the actor is "Sistem".
  actor_user_id uuid,
  actor_name text not null,
  actor_role text not null,
  category text not null,
  action text not null,
  target_type text not null,
  target_id text,
  target_label text not null,
  -- The creator the entry concerns, for the "creator" filter; null for Admin and settings entries.
  creator_id uuid,
  old_values jsonb,
  new_values jsonb,
  note text,
  constraint audit_logs_actor_role_check
    check (actor_role in ('super_admin', 'admin', 'creator', 'system')),
  constraint audit_logs_category_check
    check (category in ('akses_admin', 'creator_kontrak', 'invoice_pembayaran', 'pengaturan'))
);

-- The newest first, alone or under one of the filters of "Log Aktivitas".
create index audit_logs_occurred_id_idx on audit_logs (occurred_at desc, id desc);
create index audit_logs_category_action_occurred_idx
  on audit_logs (category, action, occurred_at desc, id desc);
create index audit_logs_actor_occurred_idx on audit_logs (actor_user_id, occurred_at desc, id desc);
create index audit_logs_creator_occurred_idx on audit_logs (creator_id, occurred_at desc, id desc);

alter table audit_logs enable row level security;

revoke all on audit_logs from anon, authenticated;

-- PBI-23 AC 18 (OWASP A09:2025): entries can only be added. A statement trigger also covers
-- TRUNCATE, and refuses an UPDATE or DELETE even when it matches no row.
create function audit_logs_append_only() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = 'restrict_violation';
end;
$$;

create trigger audit_logs_append_only
  before update or delete or truncate on audit_logs
  for each statement execute function audit_logs_append_only();
