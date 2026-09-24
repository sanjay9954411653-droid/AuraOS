   ALTER TABLE order_items ADD COLUMN IF NOT EXISTS round INTEGER NOT NULL DEFAULT 1;
   CREATE INDEX IF NOT EXISTS idx_order_items_order_round ON order_items (order_id, round);
