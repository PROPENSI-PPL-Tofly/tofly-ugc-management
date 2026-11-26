-- PBI-23 (SCRUM-246): changing a role (making someone Super Admin included) and deactivating an
-- Admin first ask the Super Admin for an email code, and one confirmation covers these actions for
-- 15 minutes. The window belongs to the session that confirmed, not to the user, so another open
-- browser of the same account still has to confirm.
alter table app_sessions add column confirmed_until timestamptz(6);

-- The codes, apart from login_codes: a confirmation code must never sign anyone in, must not replace
-- a pending sign-in code, and must not share its hourly limit. Only an HMAC of each code is kept.
create table admin_confirmation_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  code_hash  char(64) not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz(6) not null,
  -- Wrong guesses so far; the code is dead at five, like a sign-in code.
  attempts   integer not null default 0 check (attempts between 0 and 5),
  used_at    timestamptz(6),
  created_at timestamptz(6) not null default now(),
  check (expires_at > created_at)
);

-- The hourly limit counts a user's rows of the last hour, and verifying reads the newest.
create index admin_confirmation_codes_user_created_idx
  on admin_confirmation_codes (user_id, created_at desc);

-- The backend alone reads or writes codes, as with login_codes.
alter table admin_confirmation_codes enable row level security;
revoke all on table admin_confirmation_codes from anon, authenticated;
