-- PBI-38 38.2: replacing a video link is recorded in the content timeline (AC 9), with the
-- platform and the link it replaced in event_data.
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
    'Auto Scheduled'
  )
);
