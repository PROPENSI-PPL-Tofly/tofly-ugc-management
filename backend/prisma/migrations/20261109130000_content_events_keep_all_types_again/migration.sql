-- 20261109120000 (Revision Followup Added, PBI-33) re-adds the event type check from a list made
-- before PBI-25 landed, so it drops 'Content Updated' that 20261107120000 had restored: every
-- content edit would be refused again. This runs after it and allows every type.
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
    'Content Updated',
    'Revision Followup Added'
  )
);
