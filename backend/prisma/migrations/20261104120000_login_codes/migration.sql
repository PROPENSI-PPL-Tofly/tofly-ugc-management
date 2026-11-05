-- Codes for signing in with an email (PBI-39; requested in 39.2 SCRUM-240, verified in 39.3
-- SCRUM-241). Only an HMAC-SHA256 of each code is kept, under a key that lives outside the
-- database. Every request stores a row: an address the whitelist refuses gets a decoy hash that
-- no code matches, so the table cannot tell registered addresses apart from unknown ones.
-- Asking again adds a newer row; verification only reads the newest, so the older code is dead.
-- There is no foreign key to users for the same reason: most decoy addresses have no user.
create table login_codes (
  id         uuid primary key default gen_random_uuid(),
  -- Trimmed and lower-cased by the backend before every lookup; at most 254 characters (RFC 5321).
  email      text not null
    check (email = lower(btrim(email)) and char_length(email) <= 254),
  code_hash  char(64) not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  -- Wrong guesses so far; the code is dead at five (MAX_CODE_ATTEMPTS in 39.3).
  attempts   integer not null default 0 check (attempts between 0 and 5),
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

-- The rate limit counts an email's rows of the last hour, and verification reads its newest.
create index login_codes_email_created_at_idx on login_codes (email, created_at desc);

-- Like app_sessions: the backend alone may read or write codes. RLS with no policy denies the
-- Data API roles every row, and the revoke stops them at the privilege check.
alter table login_codes enable row level security;
revoke all on table login_codes from anon, authenticated;
