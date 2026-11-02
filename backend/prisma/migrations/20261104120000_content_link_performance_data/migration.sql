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
