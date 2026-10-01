-- Makes the team's accounts admins on the deployed database, so they can sign in with Google.
-- Run by the backend workflow's migrate job after `prisma migrate deploy`:
--   psql "$MIGRATOR_DB_URL" -X -q -v ON_ERROR_STOP=1 -v emails="a@x.com,b@y.com" -f prisma/ops/seed-admins.sql
-- The addresses arrive only as the psql variable `emails` (a comma-separated repo secret); this
-- file holds none, because the repository is public. It only adds or promotes: removing an
-- address from the list does not demote anyone. Nothing it prints contains an address.

begin;

create temporary table seed_admin_emails on commit drop as
  select distinct lower(trim(entry)) as email
  from unnest(string_to_array(:'emails', ',')) as entry
  where trim(entry) <> '';

do $$
begin
  if not exists (select 1 from seed_admin_emails) then
    raise exception 'the admin email list is empty';
  end if;
  if exists (
    select 1 from seed_admin_emails where email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ) then
    raise exception 'the admin email list holds an entry that is not an email address';
  end if;
end
$$;

with seeded as (
  insert into users (email, is_admin)
  select email, true from seed_admin_emails
  on conflict (email) do update
    set is_admin = true, updated_at = now()
    where users.is_admin is distinct from true
  returning 1
)
select count(*) as admins_added_or_promoted from seeded;

commit;
