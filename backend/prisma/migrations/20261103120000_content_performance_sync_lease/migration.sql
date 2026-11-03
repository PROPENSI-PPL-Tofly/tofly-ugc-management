-- Which content a performance sync is working on (PBI-27, 27.4). A sync claims each content it
-- reads by setting this to the moment its claim runs out, and clears it when done. A second sync
-- of the same content, from another request or another Cloud Run instance, finds the claim and
-- is refused (AC 13). A sync that dies mid-run frees the content once the moment has passed.

alter table contents
  add column performance_sync_lease_until timestamptz(6);
