-- PBI-37 (37.1): an invoice cancelled when its contract is ended early. It is never paid and never
-- opens again; the lifecycle (invoice-lifecycle.ts) refuses every move from it.
alter type invoice_status add value if not exists 'cancelled';
