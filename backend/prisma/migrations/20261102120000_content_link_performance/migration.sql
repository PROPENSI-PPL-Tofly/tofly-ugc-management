-- Performance numbers per video link (PBI-27, 27.1). Each link keeps its own views, likes,
-- comments and shares, any of them empty (AC 1); empty means no data yet and is never read as 0
-- (AC 2). One data state per link (AC 3): waiting until a sync or an admin fills it.

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
  add column data_state link_data_state not null default 'waiting',
  add column last_synced_at timestamptz(6),
  -- The admin who typed the numbers in (AC 3, 16). No action: an admin account is never deleted
  -- while it is named on a link, as on content_links.submitted_by.
  add column manual_by uuid references users(id) on delete no action on update no action,
  add column manual_at timestamptz(6),
  add constraint content_links_metrics_check check (
    (views is null or views >= 0)
    and (likes is null or likes >= 0)
    and (comments is null or comments >= 0)
    and (shares is null or shares >= 0)
  ),
  -- Who and when are kept together, so "Diisi manual" never shows one without the other.
  add constraint content_links_manual_check check ((manual_by is null) = (manual_at is null));

create index content_links_manual_by_idx on content_links (manual_by);
