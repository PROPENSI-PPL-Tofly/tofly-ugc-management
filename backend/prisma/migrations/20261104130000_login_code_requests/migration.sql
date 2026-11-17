-- Every code request that was let through (PBI-39 AC 5, SCRUM-240), for the hourly limit alone.
-- login_codes cannot count them: a request whose email fails removes its own code row, so the
-- code sent before it stays the newest and usable, yet the request must still count, because a
-- provider may have delivered the email although the send reported a failure. A request refused
-- by the limit stores nothing here. Rows older than the hour are deleted by the next request
-- (PrismaLoginCodeIssuer), so the table only ever holds about an hour of traffic.
create table login_code_requests (
  id           uuid primary key default gen_random_uuid(),
  -- Trimmed and lower-cased like login_codes.email; unknown addresses are counted too.
  email        text not null
    check (email = lower(btrim(email)) and char_length(email) <= 254),
  requested_at timestamptz not null default now()
);

-- Counting one email's last hour, newest first.
create index login_code_requests_email_requested_at_idx
  on login_code_requests (email, requested_at desc);
-- Deleting everything older than the hour, whatever the email.
create index login_code_requests_requested_at_idx on login_code_requests (requested_at);

-- Like app_sessions and login_codes: the backend alone may read or write.
alter table login_code_requests enable row level security;
revoke all on table login_code_requests from anon, authenticated;
