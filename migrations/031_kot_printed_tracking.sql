-- 031_kot_printed_tracking.sql
-- Tracks exactly when each order item was sent to the kitchen printer, so a
-- second round of items added to an already-in-progress table bill only
-- prints the NEW items on the KOT — not the whole merged order again.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS kot_printed_at TIMESTAMPTZ;

-- Backfill: mark all existing items as already-printed (using their own
-- created_at) so this change doesn't cause a flood of reprints for orders
-- that are already in progress right now.
UPDATE order_items SET kot_printed_at = created_at WHERE kot_printed_at IS NULL;
