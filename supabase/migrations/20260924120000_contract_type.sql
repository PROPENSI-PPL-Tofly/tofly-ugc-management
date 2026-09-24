-- Contract type (PRD 3.4): whether a contract period is a probation or a regular one. It is
-- informational only; no scheduling, payment or productivity rule reads it.
create type contract_type as enum ('probation', 'regular');

-- Contracts signed before the field existed are taken as regular. The default only backfills
-- them: it is dropped right after, so every new contract has to state its type.
alter table contracts
  add column contract_type contract_type not null default 'regular';

alter table contracts
  alter column contract_type drop default;
