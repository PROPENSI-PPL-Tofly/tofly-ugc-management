-- The screenshots an admin attaches to a revision note (PBI-34, 34.1): up to five per note,
-- kept in the private bucket under object_key and opened only by Admins and the content's
-- creator (AC 6). The note's sanitized HTML sits beside its words, so a note written before
-- this change keeps only its words and reads as it always did (AC 9).
alter table submissions add column revision_notes_html text;

create table revision_note_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references submissions(id) on delete cascade on update no action,
  object_key uuid unique not null,
  file_name varchar(255) not null,
  content_type text not null,
  size_bytes integer not null,
  uploaded_by uuid not null
    references users(id) on delete no action on update no action,
  -- Set when the image goes out with the note: the history's image is then kept.
  sent_at timestamptz(6),
  created_at timestamptz(6) not null default now()
);

create index revision_note_images_submission_id_idx
  on revision_note_images (submission_id);

create index revision_note_images_uploaded_by_idx
  on revision_note_images (uploaded_by);

alter table revision_note_images enable row level security;
