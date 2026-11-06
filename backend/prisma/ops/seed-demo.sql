-- Loads the demo set on a deployed environment. Run by prisma/ops/seed-environment.sh, only for the
-- `demo` profile. It skips a database that already holds the set, so a deploy never disturbs what
-- testers are doing, and refuses production whatever the profile says.

\set ON_ERROR_STOP on

do $$
begin
  if current_database() = 'tofly' then
    raise exception 'refusing to touch the production database';
  end if;
end
$$;

select exists (select 1 from users where email = 'rangga@example.com') as demo_present \gset

\if :demo_present
  \echo 'demo data already present: nothing to do'
\else
  \ir ../seeds/demo.sql
  \echo 'demo data loaded'
\endif
