-- Hands every table, sequence, view and type in `public` to the environment's app role, the login the
-- backend connects as. Migrations run as `postgres` (..._tables_backend_only alters default privileges
-- for that role), so what they create is owned by it. Each table has row level security with no
-- policy, which only the owner passes; the app has to be that owner, and it should own nothing else.
-- Each environment's role connects only to its own database, so one environment's credentials never
-- reach the other's data. Prisma's own `_prisma_migrations` stays with `postgres`: the app has no
-- business rewriting migration history.
-- `postgres` must be a member of the app role (`grant <app_role> to postgres`) to give it objects and to
-- keep altering them in later migrations; on a managed server `postgres` is not a superuser.
-- Idempotent. Run as `postgres` after every `prisma migrate deploy`:
--   psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v app_role=tofly_prod -f prisma/ops/hand-off-ownership.sql
-- `app_role` arrives as a psql variable and is quoted with format('%I'), never spliced into SQL.

begin;

select set_config('tofly.app_role', :'app_role', true) as app_role_set \gset

do $$
declare
  app_role text := current_setting('tofly.app_role');
  item record;
begin
  if not exists (select 1 from pg_roles where rolname = app_role) then
    raise exception 'app role % does not exist', app_role;
  end if;

  execute format('grant usage on schema public to %I', app_role);

  -- Every public table keeps row level security on, Prisma's history included; its owner,
  -- `postgres`, is not held back by it.
  if to_regclass('public._prisma_migrations') is not null then
    alter table public._prisma_migrations enable row level security;
  end if;

  for item in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      -- A sequence owned by a column follows its table and cannot be altered on its own.
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype in ('a', 'i') and c.relkind = 'S'
      )
      and c.relname <> '_prisma_migrations'
      and pg_get_userbyid(c.relowner) <> app_role
  loop
    execute format(
      'alter %s public.%I owner to %I',
      case item.relkind
        when 'S' then 'sequence'
        when 'v' then 'view'
        when 'm' then 'materialized view'
        when 'f' then 'foreign table'
        else 'table'
      end,
      item.relname,
      app_role
    );
  end loop;

  for item in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'd', 'c')
      -- A table's row type belongs to the table.
      and (t.typrelid = 0 or (select relkind from pg_class where oid = t.typrelid) = 'c')
      and pg_get_userbyid(t.typowner) <> app_role
  loop
    execute format('alter type public.%I owner to %I', item.typname, app_role);
  end loop;

  for item in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and pg_get_userbyid(p.proowner) <> app_role
  loop
    execute format('alter routine %s owner to %I', item.signature, app_role);
  end loop;
end
$$;

commit;
