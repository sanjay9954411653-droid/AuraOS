-- 034_order_item_served.sql
-- Tracks when each item was served to the customer by a waiter.
-- (Kitchen finishes a round -> waiter is notified -> waiter taps "Serve Order".)

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;

-- Backfill: anything already finished before this change counts as served, so
-- nothing old shows up as "ready to serve".
UPDATE order_items SET served_at = COALESCE(updated_at, created_at) WHERE status = 'DONE' AND served_at IS NULL;
