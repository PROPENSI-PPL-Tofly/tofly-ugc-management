-- Tofly reads and writes only through its backend, which connects as the table owner. Supabase
-- grants its Data API roles (anon, holding the project's public key, and authenticated) full
-- access to every public table, so without this anyone with that key could make themselves an
-- admin in users or read creators' platform tokens in social_accounts.
--
-- RLS with no policy denies the API roles every row; the revokes stop them at the privilege
-- check as well. Neither affects the table owner.
alter table users enable row level security;
alter table creators enable row level security;
alter table social_accounts enable row level security;
alter table contracts enable row level security;
alter table contents enable row level security;
alter table submissions enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- Tables a later migration creates start closed too, instead of inheriting Supabase's grants.
-- Such a migration still turns RLS on itself.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
