-- The creator's own note on a draft ("Catatan untuk Admin" in the Submit Draft modal).
--
-- revision_notes already exists, but it is the admin's side of the exchange: what "Minta
-- Revisi" asks the creator to change. Reusing it for the creator's note would make the two
-- indistinguishable in the revision history, so the creator's note gets its own column.
-- Optional, like the field it backs.
alter table submissions
  add column creator_notes text;
