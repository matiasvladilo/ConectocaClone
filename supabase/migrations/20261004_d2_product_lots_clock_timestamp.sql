-- Change product_lots.created_at DEFAULT from now() to clock_timestamp()
-- to ensure distinct, correctly-ordered timestamps even for sequential INSERTs
-- within the same transaction (required for true FIFO when lots are created back-to-back).
--
-- now() returns transaction start time (same for all statements in a transaction).
-- clock_timestamp() returns actual wall-clock time at statement execution (microsecond resolution).
ALTER TABLE public.product_lots ALTER COLUMN created_at SET DEFAULT clock_timestamp();
