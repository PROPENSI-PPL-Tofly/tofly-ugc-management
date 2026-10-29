-- A proposal nobody decided on is scheduled at H-1 by the app itself, not by a person, and its
-- history says so: a step of its own, by the system.

alter table content_events drop constraint content_events_actor_role_check;
alter table content_events add constraint content_events_actor_role_check check (
  actor_role in ('admin', 'creator', 'system')
);

alter table content_events drop constraint content_events_event_type_check;
alter table content_events add constraint content_events_event_type_check check (
  event_type in (
    'Scheduled',
    'Draft Submitted',
    'Revision Requested',
    'Draft Approved',
    'Link Submitted',
    'Creator Comment',
    'Proposal Approved',
    'Auto Scheduled'
  )
);
