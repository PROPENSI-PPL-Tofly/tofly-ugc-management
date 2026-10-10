-- A creator-proposed content is now the pending status (20261009120000_content_lifecycle_statuses
-- moved every flagged row there), and no backend code reads is_proposal any more. Two fields
-- saying the same thing can disagree, so the flag goes.
--
-- The guard stops the drop if a flagged row is somehow not pending, for example one written by
-- a backend revision that was still running between the two migrations: dropping the column
-- then would turn a proposal into assigned work without anyone noticing.
do $$
begin
  if exists (
    select 1 from contents where is_proposal and status <> 'pending'
  ) then
    raise exception 'contents has proposals that are not pending; move them before dropping is_proposal';
  end if;
end
$$;

alter table contents
  drop column is_proposal;
