-- PBI-25 25.1: an admin's edit of a scheduled content is recorded in the content timeline with
-- the old and new value of each field it changed (AC 4), in event_data.changes.
-- It also allows 'Performance Replaced' (20261106120000), because staging applied that migration
-- first and already holds such rows; without it this check refuses them and the deploy stops.
-- "if exists" lets it run again after a failed attempt.
alter table content_events drop constraint if exists content_events_event_type_check;
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
    'Content Updated'
  )
);
