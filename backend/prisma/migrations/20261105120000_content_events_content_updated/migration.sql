-- PBI-25 25.1: an admin's edit of a scheduled content is recorded in the content timeline with
-- the old and new value of each field it changed (AC 4), in event_data.changes.
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
    'Content Updated'
  )
);
