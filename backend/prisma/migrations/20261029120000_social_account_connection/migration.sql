-- Connecting a creator's Instagram or TikTok account (PBI-19, 19.2, with the storage 19.3
-- builds on). A connected row keeps the platform's own id for the account, when its refresh
-- token runs out, and when the creator connected it. The tokens stay in access_token and
-- refresh_token, which the application now writes only encrypted (AES-256-GCM).
alter table social_accounts
  -- The platform's stable account id (TikTok open_id, Instagram user id). Null on a row typed
  -- at Tambah Creator and never connected.
  add column platform_user_id text,
  add column refresh_token_expires_at timestamptz(6),
  add column connected_at timestamptz(6);

-- One platform account belongs to one creator: "Akun ini sudah terhubung ke creator lain."
-- Rows not yet connected hold null here, and nulls never collide in a unique index.
create unique index social_accounts_platform_platform_user_id_key
  on social_accounts (platform, platform_user_id);
