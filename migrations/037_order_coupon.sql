-- 037_order_coupon.sql
-- Lets staff apply a coupon to an open order from the Bill / payment screen.
-- Idempotent: additive ALTER only.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40);
