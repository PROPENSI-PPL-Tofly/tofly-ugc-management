-- PBI-11 (11.1): every email an event sends, one row per event and recipient. The unique key is
-- what keeps a retried event from sending a second email (AC 8). payload holds the template data
-- (names, dates, links; never tokens or Admin-only notes, AC 10) so the 08:00 run can send a
-- failed email again, up to 3 attempts in total (AC 9).
create type email_status as enum ('pending', 'sent', 'failed');

create table email_log (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  template text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status email_status not null default 'pending',
  attempts integer not null default 0 check (attempts between 0 and 3),
  last_error text,
  sent_at timestamptz(6),
  created_at timestamptz(6) not null default now(),
  updated_at timestamptz(6) not null default now(),
  constraint email_log_event_key_recipient_key unique (event_key, recipient)
);

-- Backend-only, as every app table: no API role may read or write it (data-api-access e2e).
alter table email_log enable row level security;
