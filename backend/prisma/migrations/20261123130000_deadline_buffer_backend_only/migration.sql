-- deadline_buffer (SCRUM-298) is read and written only through the backend, like every Tofly
-- table (20260928140000_tables_backend_only). Without this, Supabase's Data API roles, holding the
-- project's public key, could change the one buffer every deadline rule draws with (OWASP A01:2025,
-- A02:2025). RLS with no policy denies them every row; the revoke stops them at the privilege check.
alter table deadline_buffer enable row level security;

revoke all on deadline_buffer from anon, authenticated;
