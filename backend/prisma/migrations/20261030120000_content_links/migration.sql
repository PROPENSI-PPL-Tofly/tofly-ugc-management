-- Video links per platform (PBI-38, 38.1). A content item keeps at most one link per platform
-- (AC 1), and one video belongs to one content only (AC 5). Every link handed in before this
-- change moves here with its platform and day (AC 2). contents.video_link and contents.platform
-- are no longer written from here on and stay only until a later migration drops them;
-- contents.video_submitted_at stays the content's submitted day, the day of its first link.

-- The key every link to one video shares (AC 5). An Instagram post or TikTok video is keyed by
-- the id its platform gives it ('instagram:<short code>' from /p/, /reel/, /reels/ or /tv/, with
-- or without a handle in front; 'tiktok:<video id>' under any handle or as /v/<id>.html), read
-- only on that platform's host. Any other link, a short vm.tiktok.com link included, is keyed by
-- its host in lowercase without www. and its path without trailing slashes. Scheme, query and
-- fragment never count. A value that is not a URL is keyed by its lowercase text.
-- normalizeVideoLink in src/contents/content-links.ts is the same rule, and
-- test/content-links.e2e-spec.ts holds the two to the same answers.
create function content_link_key(url text) returns text
language sql
immutable
strict
parallel safe
as $$
  select case
    when split.parts is null then lower(btrim(url, E' \t\n\r\f'))
    when (named.site = 'instagram.com' or named.site like '%.instagram.com') and ids.post is not null
      then 'instagram:' || ids.post[1]
    when (named.site = 'tiktok.com' or named.site like '%.tiktok.com') and ids.video is not null
      then 'tiktok:' || ids.video[1]
    else named.site || rtrim(split.parts[2], '/')
  end
  from (
    select regexp_match(
      btrim(url, E' \t\n\r\f'),
      '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)([^?#]*)'
    ) as parts
  ) as split
  cross join lateral (
    select regexp_replace(lower(split.parts[1]), '^www\.', '') as site
  ) as named
  cross join lateral (
    select regexp_match(split.parts[2], '^/(?:[^/]+/)?(?:p|reels?|tv)/([A-Za-z0-9_-]+)') as post,
           regexp_match(split.parts[2], '^/(?:@[^/]+/)?(?:video|v)/([0-9]+)') as video
  ) as ids
$$;

create table content_links (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id) on delete cascade on update no action,
  -- Null only on a link kept from before platforms were recorded whose host is neither
  -- Instagram nor TikTok (the seeded example.com links). Every link handed in from now on names
  -- its platform, and such a link already earned no performance bonus.
  platform social_platform,
  url text not null,
  -- content_link_key(url), kept as a column so the unique index below can hold it.
  normalized_url text not null,
  -- A day, as contents.video_submitted_at is: lateness is counted in Jakarta days.
  submitted_at date not null,
  -- The creator who handed the link in, or the admin who replaced it (38.2). No action, not
  -- restrict: a creator's deletion cascades the content away first.
  submitted_by uuid not null references users(id) on delete no action on update no action,
  created_at timestamptz(6) not null default now(),
  constraint content_links_url_check check (length(btrim(url)) > 0),
  -- The database recomputes the key, so no writer can store a link under a key of its own and
  -- slip a video past the unique index (OWASP A08:2025).
  constraint content_links_normalized_url_check check (normalized_url = content_link_key(url))
);

create unique index content_links_content_id_platform_key on content_links(content_id, platform);
create unique index content_links_normalized_url_key on content_links(normalized_url);
create index content_links_submitted_by_idx on content_links(submitted_by);

alter table content_links enable row level security;
revoke all on content_links from anon, authenticated;

-- A content's submitted day now comes with its first link here, while video_link is no longer
-- written, so the day no longer needs video_link beside it. A link kept there still has its day.
alter table contents drop constraint contents_video_link_dated;
alter table contents add constraint contents_video_link_dated check (
  video_link is null or video_submitted_at is not null
);

-- Two contents holding the same video cannot both keep it under the unique key, and dropping
-- either would lose a link (AC 2). The migration stops instead and names the video, so it is
-- settled by hand on the copy of staging data it is first run on.
-- backfill check: begin
do $$
declare
  shared text;
begin
  select string_agg(key, ', ' order by key) into shared
  from (
    select content_link_key(video_link) as key
    from contents
    where video_link is not null and btrim(video_link) <> ''
    group by 1
    having count(*) > 1
  ) as duplicated;

  if shared is not null then
    raise exception 'content_links: the same video is linked from more than one content: %', shared;
  end if;
end;
$$;
-- backfill check: end

-- Each old link with its platform, or the platform its host names when none was recorded; its
-- day, which contents_video_link_dated has always required; and the creator whose contract it is.
-- Only contents with no link here yet, so running it again moves nothing twice.
-- backfill copy: begin
insert into content_links (content_id, platform, url, normalized_url, submitted_at, submitted_by)
select c.id,
       coalesce(
         c.platform,
         case
           when h.host = 'instagram.com' or h.host like '%.instagram.com' then 'instagram'::social_platform
           when h.host = 'tiktok.com' or h.host like '%.tiktok.com' then 'tiktok'::social_platform
         end
       ),
       btrim(c.video_link),
       content_link_key(btrim(c.video_link)),
       c.video_submitted_at,
       cr.user_id
from contents c
join contracts k on k.id = c.contract_id
join creators cr on cr.id = k.creator_id
cross join lateral (
  select lower(substring(btrim(c.video_link) from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^@/?#]*@)?([^/?#:]*)')) as host
) as h
where c.video_link is not null
  and btrim(c.video_link) <> ''
  and not exists (select 1 from content_links l where l.content_id = c.id);
-- backfill copy: end
