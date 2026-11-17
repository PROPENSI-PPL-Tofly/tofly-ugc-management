-- 20261105120000 (Content Updated, PBI-25) and staging's 20261106120000 (Performance Replaced,
-- PBI-27) each re-add the event type check with their own list, so whichever runs last drops the
-- other's type: a fresh database refuses every content edit, staging every replaced number.
-- This runs after both, in either order, and allows every type.
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
    'Content Updated'
  )
);
