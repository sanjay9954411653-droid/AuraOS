-- 032_default_landing_page.sql
-- Lets each restaurant choose which dashboard page opens first after login
-- (e.g. staff who only take orders can skip the Dashboard and land on Orders).
-- Idempotent: safe to run more than once.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS default_landing_page VARCHAR(30) NOT NULL DEFAULT 'dashboard';
