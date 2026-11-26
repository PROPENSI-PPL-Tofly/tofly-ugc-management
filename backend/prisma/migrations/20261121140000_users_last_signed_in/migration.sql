-- PBI-23 (SCRUM-246): "Pengguna Admin" shows each Admin's last sign-in ("Login Terakhir"). Sessions
-- are deleted when they end, so the time is kept on the user; null means never signed in.
alter table users add column last_signed_in_at timestamptz(6);
