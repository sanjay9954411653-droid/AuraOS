-- 031_menu_item_images.sql
-- Menu item photos and a "featured" flag for the customer menu.
--
-- Image policy (see 022): we store absolute https URLs only, never image bytes.
-- Idempotent: safe to run more than once.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
