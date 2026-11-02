-- A connect replaces the username typed at Tambah Creator with the platform's (PBI-19, AC 9). The
-- row keeps only the latest one, so each change is kept here: old, new and when.
create table social_username_changes (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null
    references social_accounts(id) on delete cascade on update no action,
  old_username text not null,
  new_username text not null,
  changed_at timestamptz(6) not null default now()
);

create index social_username_changes_account_changed_idx
  on social_username_changes (social_account_id, changed_at desc);

alter table social_username_changes enable row level security;
