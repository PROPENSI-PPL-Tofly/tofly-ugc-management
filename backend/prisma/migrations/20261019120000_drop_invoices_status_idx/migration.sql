-- invoices is read only by contract_id (its unique index) and written by id (its primary key);
-- the invoice status filter runs on the rows the listing has already read, and RLS keeps every
-- client but the backend out of the table. No query leads with status, and a btree over a
-- two-value enum would rarely be chosen if one did, so the index only cost every write.
drop index if exists invoices_status_idx;
