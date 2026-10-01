-- Sessions belong to the backend alone. Supabase grants its Data API roles (anon, holding the
-- project's public key, and authenticated) full access to new public tables, so without this
-- anyone could insert a row for a hash of an id they chose and hold a session for any user.
-- RLS with no policy denies them every row; the revoke also stops them at the privilege check.
-- The backend connects as the table owner, which neither affects.
alter table app_sessions enable row level security;
revoke all on table app_sessions from anon, authenticated;
