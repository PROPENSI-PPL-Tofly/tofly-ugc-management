-- Sign-in codes sent by email (PBI-39, SCRUM-240). Only an HMAC-SHA256 of the code is stored
-- (AC 12); the key lives in LOGIN_CODE_SECRET, outside the database. An email that gets no code
-- (unknown or revoked) still gets a row, with a random hash no code matches, so the hourly limit
-- and verify answer the same for every address.
create table login_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null
    constraint login_codes_email_check check (email = lower(email) and length(email) <= 254),
  code_hash  char(64) not null
    constraint login_codes_code_hash_check check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts   integer not null default 0
    constraint login_codes_attempts_check check (attempts between 0 and 5),
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Verify reads the newest row of an email; the hourly limit counts an email's rows of the last
-- hour. Both walk this index from the newest row.
create index login_codes_email_created_at_idx on login_codes (email, created_at desc);

-- The backend alone, as app_sessions: RLS with no policy denies the API roles every row, and the
-- revoke stops them at the privilege check. The backend connects as the table owner.
alter table login_codes enable row level security;
revoke all on table login_codes from anon, authenticated;
