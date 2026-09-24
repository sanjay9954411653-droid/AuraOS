-- 035_bill_settings.sql
-- Adds bill/receipt customization fields to restaurants:
--   - FSSAI number (alongside the existing GSTIN)
--   - Discount / service charge / other charges (percent) + a flat extra charge
--   - UPI ID for a "Pay via UPI" line + QR on the bill
--   - Toggle for showing the restaurant name on the bill
--   - Which of the existing social_links to surface on the printed/WhatsApp bill
--
-- Idempotent: additive ALTERs only.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS fssai_no               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS upi_id                 VARCHAR(100),
  ADD COLUMN IF NOT EXISTS discount_percent       NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_charges_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_name_in_bill      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS bill_social_keys       JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN restaurants.bill_social_keys IS
  'Array of social_links keys (e.g. ["google_review","facebook"]) to show on the printed/WhatsApp bill footer.';
