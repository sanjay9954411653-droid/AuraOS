-- Link AuraOS subscription plans to Razorpay Test Mode plans

UPDATE subscription_plans
SET
    gateway_plan_id = 'plan_TgaX5uo0fbEYtD',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Starter';

UPDATE subscription_plans
SET
    gateway_plan_id = 'plan_TgaXwegGc40PX1',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Professional';
