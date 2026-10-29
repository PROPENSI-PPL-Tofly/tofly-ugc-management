create table content_events (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id) on delete cascade on update no action,
  event_type text not null,
  actor_name text not null,
  actor_role text not null,
  occurred_at timestamptz(6) not null default now(),
  event_data jsonb not null,
  constraint content_events_event_type_check check (
    event_type in (
      'Scheduled',
      'Draft Submitted',
      'Revision Requested',
      'Draft Approved',
      'Link Submitted',
      'Creator Comment'
    )
  ),
  constraint content_events_actor_role_check check (actor_role in ('admin', 'creator'))
);

create index content_events_content_occurred_id_idx
  on content_events (content_id, occurred_at desc, id desc);

alter table content_events enable row level security;

revoke all on content_events from anon, authenticated;
