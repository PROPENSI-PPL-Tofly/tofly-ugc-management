-- A sync that replaces numbers an admin typed in is recorded in the content timeline with the old
-- and new values (PBI-27 AC 17).
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
    'Performance Replaced'
  )
);
