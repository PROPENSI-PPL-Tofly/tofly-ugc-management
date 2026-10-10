-- Content history follow-up: who an admin event was by without keeping their email in it, the
-- event a proposal approval records, and a history for every content that predates the table.

-- An admin event names "Admin" on screen and keeps the account behind it by id. The email was
-- stored as the actor's name before, and that name is what the timeline shows a creator.
alter table content_events
  add column actor_user_id uuid references users(id) on delete set null on update no action;

update content_events e
set actor_user_id = u.id
from users u
where e.actor_role = 'admin'
  and u.email = e.actor_name;

update content_events
set actor_name = 'Admin'
where actor_role = 'admin';

-- An admin approving a creator's proposal (PRD 3.10) is its own step in the history.
alter table content_events drop constraint content_events_event_type_check;
alter table content_events add constraint content_events_event_type_check check (
  event_type in (
    'Scheduled',
    'Draft Submitted',
    'Revision Requested',
    'Draft Approved',
    'Link Submitted',
    'Creator Comment',
    'Proposal Approved'
  )
);

-- Backfill: a content created before the history existed gets the steps its rows prove, at the
-- times they were stored. Only contents with no event at all, so running it twice adds nothing
-- and a content that already started recording keeps its real history.
create temporary table backfill_contents as
select c.id,
       c.status,
       c.created_at,
       c.updated_at,
       c.video_link,
       c.video_submitted_at,
       c.approval_bypassed,
       concat_ws(' ', cr.first_name, cr.middle_name, cr.last_name) as creator_name,
       (select max(s.created_at) from submissions s where s.content_id = c.id) as last_draft_at
from contents c
join contracts k on k.id = c.contract_id
join creators cr on cr.id = k.creator_id
where not exists (select 1 from content_events e where e.content_id = c.id);

-- Created: by the creator when it is still their proposal, by an admin otherwise.
insert into content_events (content_id, event_type, actor_name, actor_role, occurred_at, event_data)
select b.id,
       'Scheduled',
       case when b.status = 'pending' then b.creator_name else 'Admin' end,
       case when b.status = 'pending' then 'creator' else 'admin' end,
       b.created_at,
       '{}'::jsonb
from backfill_contents b;

-- Each draft, numbered from the oldest, with the creator's note to the admin when they wrote one.
insert into content_events (content_id, event_type, actor_name, actor_role, occurred_at, event_data)
select b.id,
       'Draft Submitted',
       b.creator_name,
       'creator',
       s.created_at,
       jsonb_strip_nulls(jsonb_build_object(
         'version', row_number() over (partition by s.content_id order by s.created_at, s.id),
         'link', s.link,
         'note', nullif(btrim(s.creator_notes), '')
       ))
from backfill_contents b
join submissions s on s.content_id = b.id;

-- The admin's revision note sits on the draft it was written about, stamped when it was written.
insert into content_events (content_id, event_type, actor_name, actor_role, occurred_at, event_data)
select b.id,
       'Revision Requested',
       'Admin',
       'admin',
       s.updated_at,
       jsonb_build_object('revision_note', btrim(s.revision_notes))
from backfill_contents b
join submissions s on s.content_id = b.id
where nullif(btrim(s.revision_notes), '') is not null;

-- Approved: still standing in Draft Approved (stamped by the status change), or provably
-- approved before its link went in, which is every link that did not bypass the approval.
insert into content_events (content_id, event_type, actor_name, actor_role, occurred_at, event_data)
select b.id,
       'Draft Approved',
       'Admin',
       'admin',
       case when b.status = 'draft_approved' then b.updated_at
            else b.last_draft_at + interval '1 hour' end,
       '{}'::jsonb
from backfill_contents b
where b.status = 'draft_approved'
   or (b.status = 'link_submitted' and not b.approval_bypassed and b.last_draft_at is not null);

-- The link: only its day was stored, so it reads as midday in Jakarta, and never before the
-- steps it closed.
insert into content_events (content_id, event_type, actor_name, actor_role, occurred_at, event_data)
select b.id,
       'Link Submitted',
       b.creator_name,
       'creator',
       greatest(
         (b.video_submitted_at + time '12:00') at time zone 'Asia/Jakarta',
         coalesce(b.last_draft_at + interval '2 hours', b.created_at + interval '1 minute')
       ),
       jsonb_build_object('link', b.video_link)
from backfill_contents b
where b.video_submitted_at is not null
  and b.video_link is not null;

drop table backfill_contents;
