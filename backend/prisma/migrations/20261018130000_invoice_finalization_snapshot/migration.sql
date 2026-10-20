ALTER TABLE invoices
  ADD COLUMN snapshot jsonb,
  ADD COLUMN finalized_at timestamptz(6),
  ADD CONSTRAINT invoices_finalized_snapshot_check CHECK (
    (status = 'running' AND finalized_at IS NULL AND snapshot IS NULL)
    OR (status = 'finalized' AND finalized_at IS NOT NULL AND snapshot IS NOT NULL)
  );
