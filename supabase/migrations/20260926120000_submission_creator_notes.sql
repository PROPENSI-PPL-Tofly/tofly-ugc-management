-- Catatan untuk Admin (PRD 3.16): the optional note a creator sends with a draft hand-in. It
-- sits apart from revision_notes, which holds the admin's revision feedback on the same row.
-- The cap matches MAX_DRAFT_NOTES_LENGTH in the backend, so a direct write cannot exceed it.
alter table submissions
  add column creator_notes text
    constraint submissions_creator_notes_length check (char_length(creator_notes) <= 1000);
