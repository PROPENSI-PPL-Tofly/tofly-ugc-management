-- PBI-23 (SCRUM-245, review on #225): the role is filled in only where a row is made an Admin the
-- old way, with only is_admin: on insert, or when is_admin turns on. Before this, writing a null
-- role onto a Super Admin quietly made them Admin, which would slip past the "at least one Super
-- Admin" rule of 23.2. Now the users_admin_role_matches_is_admin check refuses that write.
create or replace function users_admin_role_default() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if not new.is_admin then
    new.admin_role := null;
  elsif new.admin_role is null
    and (tg_op = 'INSERT' or not old.is_admin) then
    new.admin_role := 'admin';
  end if;
  return new;
end;
$$;
