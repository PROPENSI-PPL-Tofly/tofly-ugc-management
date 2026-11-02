-- Performance numbers per video link (PBI-27, 27.1). Each link handed in per platform (PBI-38)
-- keeps its own views, likes, comments and shares. A number is null until a sync or an admin
-- gives it (AC 1, 2): null is "no data yet" and a stored 0 is a real 0, so neither stands in
-- for the other. The data state says where the numbers stand (AC 3); 27.4's sync writes the
-- same columns and imports link_data_state by name, so names and values are a shared contract.

create type link_data_state as enum (
  'waiting',
  'not_connected',
  'synced',
  'not_found',
  'sync_failed',
  'manual'
);

alter table content_links
  add column views integer,
  add column likes integer,
  add column comments integer,
  add column shares integer,
  -- A link starts waiting for its first numbers; read as not_connected while the creator has
  -- not connected that platform (an effective state, never stored by 27.1).
  add column data_state link_data_state not null default 'waiting',
  -- When a sync last brought the numbers; null until one has.
  add column last_synced_at timestamptz(6),
  -- A count is never negative, whoever writes it (OWASP A08:2025).
  add constraint content_links_metrics_check check (
    (views is null or views >= 0)
    and (likes is null or likes >= 0)
    and (comments is null or comments >= 0)
    and (shares is null or shares >= 0)
  );

-- Who typed numbers in by hand, and when (AC 16). Set together by a manual entry and cleared
-- together by a sync or a replaced link, so the check keeps them paired (OWASP A08:2025). No
-- action on delete: an admin account named here is never removed, as with submitted_by.
alter table content_links
  add column manual_by uuid references users(id) on delete no action on update no action,
  add column manual_at timestamptz(6),
  add constraint content_links_manual_check check ((manual_by is null) = (manual_at is null));

create index content_links_manual_by_idx on content_links(manual_by);

-- A manual entry is recorded in the content timeline with its old and new numbers (AC 16).
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
    'Performance Entered'
  )
);
