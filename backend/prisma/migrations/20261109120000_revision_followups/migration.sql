-- Follow-up notes under a revision note already sent (PBI-33, 33.1): each is its own row, so the
-- original note in submissions.revision_notes is never changed (AC 4). Oldest first per round.
create table revision_followups (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null
    references submissions(id) on delete cascade on update no action,
  body           text not null,
  author_user_id uuid not null
    references users(id) on delete no action on update no action,
  created_at     timestamptz(6) not null default now()
);

create index revision_followups_submission_created_at_idx
  on revision_followups (submission_id, created_at);

create index revision_followups_author_user_id_idx
  on revision_followups (author_user_id);

alter table revision_followups enable row level security;

-- The content timeline records each follow-up as "Catatan susulan ditambahkan" (AC 6).
alter table content_events drop constraint content_events_event_type_check;
alter table content_events add constraint content_events_event_type_check check (
  event_type in (
    'Scheduled',
    'Draft Submitted',
    'Revision Requested',
    'Draft Approved',
    'Link Submitted',
    'Link Replaced',
    'Creator Comment',
    'Proposal Approved',
    'Auto Scheduled',
    'Performance Entered',
    'Performance Replaced',
    'Revision Followup Added'
  )
);
