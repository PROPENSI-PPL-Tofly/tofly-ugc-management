-- Server-backed application sessions for the opaque HTTP-only browser cookie.
-- The raw bearer ID is never stored; the backend stores its SHA-256 digest.
create table app_sessions (
  id_hash             char(64) primary key
    check (id_hash ~ '^[0-9a-f]{64}$'),
  user_id             uuid not null references users (id) on delete cascade,
  role                text not null check (role in ('admin', 'creator')),
  creator_id          uuid references creators (id) on delete cascade,
  idle_expires_at     timestamptz not null,
  absolute_expires_at timestamptz not null,
  created_at          timestamptz not null default now(),
  check (idle_expires_at <= absolute_expires_at),
  check (
    (role = 'creator' and creator_id is not null)
    or (role = 'admin' and creator_id is null)
  )
);

create index app_sessions_idle_expires_at_idx on app_sessions (idle_expires_at);
create index app_sessions_absolute_expires_at_idx on app_sessions (absolute_expires_at);
