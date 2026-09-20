/**
 * Table service requests — "Call Waiter" and "Request Bill".
 *
 * Customer-facing (no auth) endpoints that CREATE requests live in
 * public.routes.ts. This file is the staff side: list pending requests and
 * resolve them.
 *
 *   GET   /api/v1/table-requests             — list pending requests
 *   POST  /api/v1/table-requests/:id/resolve — mark a request as handled
 */

import { Router, Response, NextFunction } from 'express';
import { query } from '@/config/database';
import { successResponse } from '@/shared/utils/responseHandler';
import { NotFoundError } from '@/shared/errors/AppError';
import { authenticate, AuthenticatedRequest } from '@/shared/middleware/authenticate';
import { eventBroadcaster } from '@/shared/socket/eventBroadcaster';

const router = Router();

// ─── GET /api/v1/table-requests ─────────────────────────────────────────────
// All PENDING requests for the logged-in staff member's restaurant.

router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) throw new Error('User not associated with a restaurant');

    const result = await query(
      `SELECT tr.id, tr.type, tr.status, tr.created_at, t.table_number
       FROM table_requests tr
       INNER JOIN restaurant_tables t ON t.id = tr.table_id
       WHERE tr.restaurant_id = $1 AND tr.status = 'PENDING'
       ORDER BY tr.created_at ASC`,
      [restaurantId],
    );

    res.json(successResponse(result.rows));
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/table-requests/:id/resolve ────────────────────────────────

router.post('/:id/resolve', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) throw new Error('User not associated with a restaurant');

    const result = await query(
      `UPDATE table_requests
       SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND restaurant_id = $2 AND status = 'PENDING'
       RETURNING id, table_id, type`,
      [req.params.id, restaurantId],
    );

    if (result.rows.length === 0) throw new NotFoundError('Request not found or already resolved');

    eventBroadcaster?.broadcastTableRequestResolved({
      request_id: result.rows[0].id,
      restaurant_id: restaurantId,
      table_id: result.rows[0].table_id,
    });

    res.json(successResponse({ resolved: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
