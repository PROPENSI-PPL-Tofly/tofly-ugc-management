-- PBI-37 (37.1), PRD Sprint 4 cross-PBI rule 1: a creator's access follows their contracts (an
-- active or waiting period, or an invoice not yet Paid or Cancelled), so the creator-level revoke
-- date goes. It was never set by the app; an early end now lives on the contract instead.
alter table creators drop column access_revoke_date;
