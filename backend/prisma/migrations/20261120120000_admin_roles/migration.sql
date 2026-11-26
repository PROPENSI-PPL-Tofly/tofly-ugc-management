-- PBI-23 (SCRUM-245): two Admin roles, Super Admin and Admin, an Admin's display name, and an
-- active flag so an Admin can be deactivated and reactivated instead of deleted (accounts are never
-- hard-deleted, so names on finalized invoices stay). Every Admin there is today becomes Admin;
-- the first Super Admin comes from SUPER_ADMIN_EMAIL when the backend starts.
create type admin_role as enum ('admin', 'super_admin');

alter table users
  add column name text,
  add column admin_role admin_role,
  add column is_active boolean not null default true;

update users set admin_role = 'admin' where is_admin;

-- A row made the old way, with only is_admin (prisma/ops/seed-admins.sql, the seeds, older tests),
-- is an Admin; a user who stops being an Admin keeps no role.
create function users_admin_role_default() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if new.is_admin and new.admin_role is null then
    new.admin_role := 'admin';
  elsif not new.is_admin then
    new.admin_role := null;
  end if;
  return new;
end;
$$;

create trigger users_admin_role_default
  before insert or update of is_admin, admin_role on users
  for each row execute function users_admin_role_default();

-- An Admin always has a role and a creator never does, so no row can be half an Admin.
alter table users add constraint users_admin_role_matches_is_admin
  check ((admin_role is not null) = is_admin);

-- "Tambah Admin" takes a name of at most 100 characters; blank is not a name.
alter table users add constraint users_name_length
  check (name is null or (char_length(name) <= 100 and btrim(name) <> ''));
