-- Query-plan analysis for the invoice roster's hot queries (CPL 6 MRA — behavioral analysis).
--
-- Run against a DISPOSABLE PostgreSQL 17 (never a deployed environment):
--   docker exec -i tofly-perf-db psql -U postgres -X -v ON_ERROR_STOP=1 -f - < scripts/bench/explain-hot-queries.sql
--
-- The queries mirror what Prisma issues from prisma-invoice-roster.repository.ts and
-- invoices.service.ts: the roster narrowed by the contract-end range (the I2.3 filter pushed
-- into the query), the contents of a page of contracts, and one invoice's adjustments in
-- their read order. The data is synthetic and deterministic (md5-derived UUIDs), sized to
-- make the planner choose between sequential and index access: 5,000 creators, 10,000
-- contracts, 30,000 contents, 60,000 links, 10,000 invoices, 20,000 adjustments.
-- Results recorded in docs/perf/profiling-notes.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- Synthetic data (rolled back at the end: the script may run repeatedly)
-- ---------------------------------------------------------------------------

INSERT INTO users (id, email, is_admin)
SELECT md5('user-' || i)::uuid, 'perf-' || i || '@example.com', false
FROM generate_series(1, 5000) AS i;

INSERT INTO creators (id, user_id, first_name, last_name)
SELECT md5('creator-' || i)::uuid, md5('user-' || i)::uuid,
       'Perf' || (i % 97), 'Creator' || i
FROM generate_series(1, 5000) AS i;

-- Two contracts per creator: one ending in mid-2026, one in 2027.
INSERT INTO contracts (id, creator_id, start_date, end_date, days_between, content_quota, fixed_rate, contract_type)
SELECT md5('contract-' || i || '-' || p)::uuid, md5('creator-' || i)::uuid,
       DATE '2026-01-01' + (i % 180),
       (CASE WHEN p = 0 THEN DATE '2026-06-01' ELSE DATE '2027-03-01' END) + (i % 90),
       7, 24, 5000000, 'regular'::contract_type
FROM generate_series(1, 5000) AS i, LATERAL (VALUES (0), (1)) AS v(p);

INSERT INTO contents (id, contract_id, name, type, deadline, status)
SELECT md5('content-' || i || '-' || p)::uuid,
       md5('contract-' || (i % 5000 + 1) || '-' || ((i + p) % 2))::uuid,
       'Konten ' || i || '-' || p,
       (CASE WHEN (i + p) % 2 = 0 THEN 'evergreen' ELSE 'specific' END)::content_type,
       DATE '2026-02-01' + ((i * 3 + p) % 600),
       'scheduled'::content_status
FROM generate_series(1, 30000) AS i, LATERAL (VALUES (0), (1)) AS v(p);

INSERT INTO content_links (id, content_id, platform, url, normalized_url, submitted_at, submitted_by, data_state)
SELECT md5('link-' || i || '-' || p)::uuid, md5('content-' || i || '-0')::uuid,
       (CASE WHEN (i + p) % 2 = 0 THEN 'instagram' ELSE 'tiktok' END)::social_platform,
       'https://example.com/' || i || '/' || p,
       content_link_key('https://example.com/' || i || '/' || p),
       now(), md5('user-' || (i % 5000 + 1))::uuid, 'waiting'::link_data_state
FROM generate_series(1, 30000) AS i, LATERAL (VALUES (0), (1)) AS v(p);

INSERT INTO invoices (id, contract_id, status)
SELECT md5('invoice-' || i || '-' || p)::uuid, md5('contract-' || i || '-' || p)::uuid,
       'running'::invoice_status
FROM generate_series(1, 5000) AS i, LATERAL (VALUES (0), (1)) AS v(p);

INSERT INTO invoice_adjustments (id, invoice_id, amount, reason, actor_user_id)
SELECT md5('adjust-' || i || '-' || p)::uuid, md5('invoice-' || (i % 5000 + 1) || '-0')::uuid,
       (10000 * (i % 7 + 1)), 'Penyesuaian perf ' || i || '-' || p, md5('user-' || (i % 5000 + 1))::uuid
FROM generate_series(1, 10000) AS i, LATERAL (VALUES (0), (1)) AS v(p);

ANALYZE creators, contracts, contents, content_links, invoices, invoice_adjustments;

COMMIT;

-- ---------------------------------------------------------------------------
-- Q1. Roster narrowed by the contract-end range (I2.3's filter, in the query)
-- Prisma: creators.findMany({ where: { contracts: { some: { end_date: { gte, lte } } } } })
-- ---------------------------------------------------------------------------

EXPLAIN (ANALYZE, BUFFERS)
SELECT c.id, c.first_name, c.last_name
FROM creators c
WHERE EXISTS (
  SELECT 1 FROM contracts k
  WHERE k.creator_id = c.id AND k.end_date >= DATE '2026-06-01' AND k.end_date <= DATE '2026-06-30'
)
ORDER BY c.first_name, c.last_name, c.id;

-- ---------------------------------------------------------------------------
-- Q2. Roster open (no range): every creator with a contract — the default table
-- Prisma: creators.findMany({ where: { contracts: { some: {} } } })
-- ---------------------------------------------------------------------------

EXPLAIN (ANALYZE, BUFFERS)
SELECT c.id, c.first_name, c.last_name
FROM creators c
WHERE EXISTS (SELECT 1 FROM contracts k WHERE k.creator_id = c.id)
ORDER BY c.first_name, c.last_name, c.id;

-- ---------------------------------------------------------------------------
-- Q3. Contents of a page of contracts (the calculator's inputs), deadline order
-- Prisma: contents.findMany({ where: { contract_id: { in: [...] } }, orderBy: { deadline: 'asc' } })
-- ---------------------------------------------------------------------------

EXPLAIN (ANALYZE, BUFFERS)
SELECT ct.id, ct.contract_id, ct.deadline
FROM contents ct
WHERE ct.contract_id = ANY(ARRAY[
  md5('contract-1-0')::uuid, md5('contract-2-0')::uuid, md5('contract-3-0')::uuid,
  md5('contract-4-0')::uuid, md5('contract-5-0')::uuid, md5('contract-6-0')::uuid,
  md5('contract-7-0')::uuid, md5('contract-8-0')::uuid, md5('contract-9-0')::uuid,
  md5('contract-10-0')::uuid
])
ORDER BY ct.deadline ASC;

-- ---------------------------------------------------------------------------
-- Q4. One invoice's adjustments in their read order
-- Prisma: invoice_adjustments.findMany({ where: { invoice_id: { in: [...] }, orderBy: [{created_at: 'asc'}, {id: 'asc'}] } })
-- ---------------------------------------------------------------------------

EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id, a.amount, a.created_at
FROM invoice_adjustments a
WHERE a.invoice_id = ANY(ARRAY[
  md5('invoice-1-0')::uuid, md5('invoice-2-0')::uuid, md5('invoice-3-0')::uuid,
  md5('invoice-4-0')::uuid, md5('invoice-5-0')::uuid
])
ORDER BY a.created_at ASC, a.id ASC;
