-- The creator's fixed rate (PBI-8, Subtask 8.1) stays contracts.fixed_rate, the only fixed rate
-- there is. The Add Creator form of the Tofly Module 1 prototype takes it in whole rupiah, at
-- most Rp10.000.000 (FV.fAccFixedRate), so the column narrows from numeric(14, 2) to
-- numeric(12, 2) and holds the same cap.
--
-- The guard stops the migration if a stored rate is past the cap or not whole: neither the type
-- change nor the new constraint may round, truncate or otherwise alter a rate someone agreed to.
-- The existing fixed_rate >= 0 check stays; the validator is what refuses a zero rate.
do $$
begin
  if exists (
    select 1 from contracts
    where fixed_rate > 10000000 or fixed_rate <> trunc(fixed_rate)
  ) then
    raise exception 'contracts has fixed rates past Rp10.000.000 or with cents; fix them before narrowing fixed_rate';
  end if;
end
$$;

alter table contracts
  alter column fixed_rate type numeric(12, 2),
  add constraint contracts_fixed_rate_prototype_check
    check (fixed_rate <= 10000000 and fixed_rate = trunc(fixed_rate));
