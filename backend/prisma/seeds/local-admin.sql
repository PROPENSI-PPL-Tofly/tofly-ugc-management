-- The admin account for local development and CI, applied by `npm run db:seed` before demo.sql.
-- Kept apart from the demo set because deployed admins come only from ADMIN_EMAILS.

insert into users (email, is_admin) values ('admin@tofly.id', true);
