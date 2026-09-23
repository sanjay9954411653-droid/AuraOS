-- Web Push subscriptions — lets us wake the Waiter app (OS-level
-- notification, sound + vibration) for "Call Waiter" / "Request Bill"
-- even when the app isn't the active tab / screen is locked.
-- One row per device the staff member has enabled notifications on.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_restaurant
  ON push_subscriptions(restaurant_id);
