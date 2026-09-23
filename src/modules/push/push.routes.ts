/**
 * Web Push subscription management — staff side (Waiter app etc).
 *
 *   GET  /api/v1/push/vapid-public-key — public key the client needs to subscribe
 *   POST /api/v1/push/subscribe        — register this device for push alerts
 *   POST /api/v1/push/unsubscribe      — stop alerting this device
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { successResponse } from '@/shared/utils/responseHandler';
import { authenticate, AuthenticatedRequest } from '@/shared/middleware/authenticate';
import { env } from '@/config/env';
import { pushEnabled } from '@/config/webpush';
import { pushService } from './push.service';

const router = Router();

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

router.get('/vapid-public-key', authenticate, (_req, res) => {
  res.json(successResponse({ enabled: pushEnabled, publicKey: env.VAPID_PUBLIC_KEY }));
});

router.post('/subscribe', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');
    const subscription = SubscriptionSchema.parse(req.body);
    await pushService.saveSubscription(req.user.userId, req.user.restaurantId, subscription);
    res.status(201).json(successResponse({ subscribed: true }));
  } catch (err) {
    next(err);
  }
});

router.post('/unsubscribe', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const endpoint = z.string().url().parse(req.body?.endpoint);
    await pushService.removeSubscription(endpoint);
    res.json(successResponse({ unsubscribed: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
