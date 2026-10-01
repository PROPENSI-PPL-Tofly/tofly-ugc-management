-- Roles the early migrations name. Two of them (..._app_sessions_backend_only and
-- ..._tables_backend_only) revoke every privilege from `anon` and `authenticated`, the Data API roles
-- of the hosted Postgres the schema started on. Plain Postgres has neither, and an applied migration is
-- never edited, so they are created here, closed: no login, no privileges, nothing granted later.
-- Idempotent. Run as `postgres` once per server, before the first `prisma migrate deploy`:
--   psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f prisma/ops/bootstrap-roles.sql

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;
