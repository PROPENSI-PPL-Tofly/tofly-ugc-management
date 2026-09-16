-- Core domain for the UGC workflow: who the platform's users are, which of them are
-- creators, the contracts a creator signs, the content each contract commits them to,
-- and the draft submissions they hand in for that content.
--
-- Two fields the class diagram carries as columns are deliberately absent:
--   * contract.status  — "active"/"expired" is a pure function of start_date/end_date.
--   * content.isLate   — a function of deadline vs. video_submitted_at.
-- Storing either means every read depends on something having run an update first, and a
-- missed update silently shows a wrong contract as live. Both are derived on read instead.
-- video_submitted_at is the extra column that derivation needs: without the date the
-- content was handed in, "late" cannot be told apart from "submitted".

-- Case-insensitive email so a login and a lookup agree on Rangga@ vs rangga@.
create extension if not exists citext;

create type content_type as enum ('evergreen', 'specific');

-- The lifecycle a single content moves through, from assigned to published.
create type content_status as enum (
  'scheduled',
  'draft_review',
  'draft_revision',
  'draft_revised',
  'draft_approved',
  'link_submitted'
);

create type social_platform as enum ('instagram', 'tiktok');

-- Trigger function kept generic: every table below stamps updated_at with it.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table users (
  id         uuid primary key default gen_random_uuid(),
  email      citext      not null unique,
  is_admin   boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- A creator is a profile attached to exactly one login. Admins are users without a
-- creators row, which is why the FK lives here and not the other way round.
create table creators (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid        not null unique references users (id) on delete restrict,
  first_name         text        not null,
  middle_name        text,
  last_name          text,
  phone_number       text,
  -- Set once the final invoice is settled: from this date the account loses access.
  access_revoke_date date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger creators_set_updated_at
  before update on creators
  for each row execute function set_updated_at();

-- OAuth tokens for pulling performance data; one account per platform per creator.
create table social_accounts (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid            not null references creators (id) on delete cascade,
  platform         social_platform not null,
  username         text            not null,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  is_connected     boolean         not null default false,
  created_at       timestamptz     not null default now(),
  updated_at       timestamptz     not null default now(),
  unique (creator_id, platform)
);

create trigger social_accounts_set_updated_at
  before update on social_accounts
  for each row execute function set_updated_at();

-- One row per contract period. Renewing a contract inserts a new row rather than editing
-- the old one, so past terms stay readable as history.
create table contracts (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid          not null references creators (id) on delete cascade,
  start_date    date          not null,
  end_date      date          not null,
  -- Spacing between the deadlines generated for this contract's evergreen quota.
  days_between  integer       not null check (days_between > 0),
  content_quota integer       not null check (content_quota >= 0),
  fixed_rate    numeric(14, 2) not null check (fixed_rate >= 0),
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  constraint contracts_period_valid check (end_date >= start_date)
);

create index contracts_creator_end_date_idx on contracts (creator_id, end_date desc);

create trigger contracts_set_updated_at
  before update on contracts
  for each row execute function set_updated_at();

-- One row = one piece of content the creator owes under a contract.
create table contents (
  id                 uuid primary key default gen_random_uuid(),
  contract_id        uuid           not null references contracts (id) on delete cascade,
  name               text           not null,
  type               content_type   not null,
  brief              text           not null default '',
  deadline           date           not null,
  status             content_status not null default 'scheduled',
  -- Creator-proposed content is not a commitment until an admin accepts it, so it stays
  -- out of the progress and on-time numbers while is_proposal is true.
  is_proposal        boolean        not null default false,
  proposal_notes     text,
  video_link         text,
  video_submitted_at date,
  platform           social_platform,
  views              integer check (views >= 0),
  likes              integer check (likes >= 0),
  engagement         numeric(5, 2) check (engagement >= 0),
  created_at         timestamptz    not null default now(),
  updated_at         timestamptz    not null default now(),
  -- The pair is what "on time" is computed from; a date without a link would silently
  -- count as a submission that nobody can open.
  constraint contents_video_link_dated check (
    (video_link is null and video_submitted_at is null)
    or (video_link is not null and video_submitted_at is not null)
  )
);

create index contents_contract_deadline_idx on contents (contract_id, deadline);

create trigger contents_set_updated_at
  before update on contents
  for each row execute function set_updated_at();

-- One row per draft handed in. A second row for the same content means one revision, so
-- the revision count is derived from the row count instead of a counter that can drift.
create table submissions (
  id             uuid primary key default gen_random_uuid(),
  content_id     uuid        not null references contents (id) on delete cascade,
  creator_id     uuid        not null references creators (id) on delete cascade,
  link           text        not null,
  revision_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index submissions_content_created_at_idx on submissions (content_id, created_at);

create trigger submissions_set_updated_at
  before update on submissions
  for each row execute function set_updated_at();
