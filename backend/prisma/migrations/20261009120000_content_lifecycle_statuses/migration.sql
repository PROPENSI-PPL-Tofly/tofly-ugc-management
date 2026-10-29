-- Content lifecycle (PBI-6): a content item is in exactly one of six statuses. Pending is new,
-- for content a creator proposed and an admin has not accepted yet. Draft Revised is removed:
-- a draft handed in again after a revision request waits for review like a first draft, and
-- the review queue tells the two apart by counting hand-ins.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt: the old one steps aside,
-- the column is recast row by row, and the old type is dropped. The recast is part of the
-- ALTER TABLE, which runs as DDL on the table and is not filtered by row level security, so no
-- row can be skipped. The whole file is one transaction: if a row cannot be recast, nothing
-- changes.
alter type content_status rename to content_status_old;

create type content_status as enum (
  'pending',
  'scheduled',
  'draft_review',
  'draft_revision',
  'draft_approved',
  'link_submitted'
);

alter table contents
  alter column status drop default;

-- A proposal is pending whatever status it was created with; a resubmitted draft waits for
-- review; every other row keeps its status.
alter table contents
  alter column status type content_status
  using (
    case
      when is_proposal then 'pending'
      when status::text = 'draft_revised' then 'draft_review'
      else status::text
    end
  )::content_status;

alter table contents
  alter column status set default 'scheduled';

drop type content_status_old;
