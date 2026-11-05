-- Removes the demo set, so seed-demo.sql can load it again with dates relative to today. Names the
-- demo users one by one rather than by domain: anyone else on the environment stays. Everything
-- the demo creators own goes with them by cascade.

\set ON_ERROR_STOP on

begin;

do $$
begin
  if current_database() = 'tofly' then
    raise exception 'refusing to touch the production database';
  end if;
end
$$;

create temporary table demo_users on commit drop as
  select id from users
  where email in (
    'rangga@example.com', 'dimas@example.com', 'nabila@example.com', 'salsa@example.com',
    'yusuf@example.com', 'farah@example.com', 'bagas@example.com', 'intan@example.com',
    'reza@example.com', 'kirana@example.com', 'adit@example.com', 'melati@example.com'
  );

delete from creators where user_id in (select id from demo_users);
delete from users where id in (select id from demo_users);

commit;
