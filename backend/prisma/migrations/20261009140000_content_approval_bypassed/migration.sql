-- A creator may submit the content link inside the H-1 window without an approved draft. Once
-- the content is link_submitted, nothing else records whether approval happened, so the fact is
-- stored when it happens.
--
-- Existing rows default to false: their history cannot tell whether a draft was approved.
alter table contents
  add column approval_bypassed boolean not null default false;
