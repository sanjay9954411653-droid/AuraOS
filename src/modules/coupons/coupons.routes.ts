/**
 * Coupons.
 *
 *   Public (customer):
 *     POST /api/v1/public/site/:slug/coupon/validate  { code, order_total }
 *       -> { valid, discount, code, message }
 *
 *   Owner/staff:
 *     GET/POST/PATCH/DELETE /api/v1/coupons
 *
 * Validation computes the discount but does NOT consume the coupon — the
 * redemption is recorded when the order is actually placed (increment used_count).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTenant } from '@/config/database';
import { successResponse } from '@/shared/utils/responseHandler';
import { NotFoundError, ConflictError, BadRequestError } from '@/shared/errors/AppError';
import { authenticate, AuthenticatedRequest } from '@/shared/middleware/authenticate';
import { authorize } from '@/shared/middleware/authorize';
import { checkSubscription } from '@/shared/middleware/checkSubscription';
import { couponRuleError, buildCouponUpdate, computeCouponDiscount } from './coupons.rules';
import { getOrderCouponDiscount } from '@/shared/billing';

export { computeCouponDiscount };

// ── Public validate router (mounted under /public) ─────────────────────────────
export const publicCouponRouter = Router();

const ValidateSchema = z.object({
  code: z.string().min(1).max(40),
  order_total: z.number().min(0),
});

publicCouponRouter.post(
  '/site/:slug/coupon/validate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = await query(`SELECT id FROM restaurants WHERE slug = $1 LIMIT 1`, [req.params.slug]);
      if (r.rows.length === 0) throw new NotFoundError('Restaurant not found');
      const restaurantId = r.rows[0].id;
      const { code, order_total } = ValidateSchema.parse(req.body);

      const c = await query(
        `SELECT * FROM coupons WHERE restaurant_id = $1 AND UPPER(code) = UPPER($2) LIMIT 1`,
        [restaurantId, code],
      );
      if (c.rows.length === 0) {
        res.json(successResponse({ valid: false, discount: 0, message: 'Invalid coupon code' }));
        return;
      }
      const result = computeCouponDiscount(c.rows[0], order_total);
      res.json(successResponse({ ...result, code: c.rows[0].code }));
    } catch (err) { next(err); }
  },
);

// ── Owner CRUD router (mounted at /coupons) ────────────────────────────────────
const router = Router();

router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await withTenant(req.user!.restaurantId, async (q) => {
      const result = await q(`SELECT * FROM coupons ORDER BY created_at DESC`);
      return result.rows;
    });
    res.json(successResponse(rows));
  } catch (err) { next(err); }
});

// Optional fields accept null so an edit can CLEAR them (e.g. remove a usage limit).
const CouponFields = {
  code: z.string().trim().min(1, 'Code is required').max(40).regex(/^\S+$/, 'Code cannot contain spaces'),
  description: z.string().trim().max(255).nullable().optional(),
  discount_type: z.enum(['FLAT', 'PERCENT']),
  discount_value: z.number().positive('Discount must be more than 0'),
  min_order: z.number().min(0).nullable().optional(),
  max_discount: z.number().min(0).nullable().optional(),
  usage_limit: z.number().int().min(1).nullable().optional(),
  valid_from: z.string().datetime({ offset: true }).nullable().optional(),
  valid_until: z.string().datetime({ offset: true }).nullable().optional(),
  is_active: z.boolean().optional(),
};
const CreateCouponSchema = z.object(CouponFields);
const UpdateCouponSchema = z.object(CouponFields).partial();

/** Turns a Postgres "duplicate key" error into a clear message for the owner. */
function rethrowDuplicate(err: unknown): never {
  if ((err as { code?: string })?.code === '23505') {
    throw new ConflictError('A coupon with this code already exists');
  }
  throw err;
}

router.post('/', authenticate, authorize('ADMIN'), checkSubscription, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = CreateCouponSchema.parse(req.body);
    const problem = couponRuleError(b);
    if (problem) throw new BadRequestError(problem);

    const restaurantId = req.user!.restaurantId;
    const row = await withTenant(restaurantId, async (q) => {
      const result = await q(
        `INSERT INTO coupons
           (restaurant_id, code, description, discount_type, discount_value, min_order,
            max_discount, usage_limit, valid_from, valid_until, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [restaurantId, b.code.toUpperCase(), b.description ?? null, b.discount_type, b.discount_value,
         b.min_order ?? 0, b.max_discount ?? null, b.usage_limit ?? null,
         b.valid_from ?? null, b.valid_until ?? null, b.is_active ?? true],
      );
      return result.rows[0];
    }).catch(rethrowDuplicate);
    res.status(201).json(successResponse(row, { message: 'Coupon created' }));
  } catch (err) { next(err); }
});

router.patch('/:id', authenticate, authorize('ADMIN'), checkSubscription, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const b = UpdateCouponSchema.parse(req.body);
    const restaurantId = req.user!.restaurantId;

    const row = await withTenant(restaurantId, async (q) => {
      const existing = await q(`SELECT * FROM coupons WHERE id = $1`, [req.params.id]);
      if (existing.rows.length === 0) return undefined;
      const cur = existing.rows[0];

      // Check the rules against the FINAL values (what is sent + what is kept).
      const problem = couponRuleError({
        discount_type: b.discount_type ?? cur.discount_type,
        discount_value: b.discount_value ?? cur.discount_value,
        valid_from: b.valid_from !== undefined ? b.valid_from : cur.valid_from,
        valid_until: b.valid_until !== undefined ? b.valid_until : cur.valid_until,
      });
      if (problem) throw new BadRequestError(problem);

      const update = buildCouponUpdate(String(req.params.id), b as Record<string, unknown>);
      if (!update) return cur; // nothing to change
      const result = await q(update.sql, update.values);
      return result.rows[0];
    }).catch(rethrowDuplicate);

    if (!row) throw new NotFoundError('Coupon not found');
    res.json(successResponse(row, { message: 'Coupon updated' }));
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const deleted = await withTenant(req.user!.restaurantId, async (q) => {
      const result = await q(`DELETE FROM coupons WHERE id = $1 RETURNING id`, [req.params.id]);
      return result.rows[0];
    });
    if (!deleted) throw new NotFoundError('Coupon not found');
    res.json(successResponse({ id: deleted.id }, { message: 'Coupon deleted' }));
  } catch (err) { next(err); }
});

// ── Staff: apply / remove a coupon on an open order (Bill / payment screen) ────
const STAFF_ROLES = ['ADMIN', 'WAITER', 'RECEPTION', 'KITCHEN'] as const;

/** Current coupon + discount for an order (recomputed on the live subtotal). */
router.get('/order/:orderId', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const restaurantId = req.user!.restaurantId;
    const out = await withTenant(restaurantId, async (q) => {
      const o = await q(`SELECT total_amount FROM orders WHERE id = $1 AND restaurant_id = $2`, [req.params.orderId, restaurantId]);
      if (o.rows.length === 0) return undefined;
      return getOrderCouponDiscount(q, restaurantId, String(req.params.orderId), Number(o.rows[0].total_amount || 0));
    });
    if (!out) throw new NotFoundError('Order not found');
    res.json(successResponse(out));
  } catch (err) { next(err); }
});

const ApplySchema = z.object({
  order_id: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
});

router.post('/apply', authenticate, authorize(...STAFF_ROLES), checkSubscription, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { order_id, code } = ApplySchema.parse(req.body);
    const restaurantId = req.user!.restaurantId;

    const out = await withTenant(restaurantId, async (q) => {
      const o = await q(`SELECT id, status, total_amount, coupon_code FROM orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`, [order_id, restaurantId]);
      if (o.rows.length === 0) throw new NotFoundError('Order not found');
      const order = o.rows[0];
      if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
        throw new BadRequestError('Coupons can only be applied to open orders');
      }
      const subtotal = Number(order.total_amount || 0);

      const c = await q(`SELECT * FROM coupons WHERE restaurant_id = $1 AND UPPER(code) = UPPER($2) LIMIT 1`, [restaurantId, code]);
      if (c.rows.length === 0) throw new BadRequestError('Invalid coupon code');
      const coupon = c.rows[0];

      // Same coupon already on this order: nothing to do (don't consume twice).
      if (order.coupon_code && String(order.coupon_code).toUpperCase() === String(coupon.code).toUpperCase()) {
        const same = computeCouponDiscount({ ...coupon, used_count: Math.max(0, Number(coupon.used_count) - 1) }, subtotal);
        return { code: coupon.code, discount: same.valid ? same.discount : 0 };
      }

      const result = computeCouponDiscount(coupon, subtotal);
      if (!result.valid) throw new BadRequestError(result.message || 'Coupon cannot be applied');

      // Consume one use (guarded so the usage limit can't be exceeded).
      const used = await q(
        `UPDATE coupons SET used_count = used_count + 1, updated_at = NOW()
         WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit) RETURNING id`,
        [coupon.id],
      );
      if (used.rows.length === 0) throw new BadRequestError('Coupon usage limit reached');

      // Swapping coupons: give the previous coupon its use back.
      if (order.coupon_code) {
        await q(
          `UPDATE coupons SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
           WHERE restaurant_id = $1 AND UPPER(code) = UPPER($2)`,
          [restaurantId, order.coupon_code],
        );
      }

      await q(`UPDATE orders SET coupon_code = $2, updated_at = NOW() WHERE id = $1`, [order_id, coupon.code]);
      return { code: coupon.code, discount: result.discount };
    });

    res.json(successResponse(out, { message: 'Coupon applied' }));
  } catch (err) { next(err); }
});

router.delete('/apply/:orderId', authenticate, authorize(...STAFF_ROLES), checkSubscription, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const restaurantId = req.user!.restaurantId;
    const found = await withTenant(restaurantId, async (q) => {
      const o = await q(`SELECT id, status, coupon_code FROM orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`, [req.params.orderId, restaurantId]);
      if (o.rows.length === 0) return false;
      const order = o.rows[0];
      if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
        throw new BadRequestError('This order is already closed');
      }
      if (order.coupon_code) {
        await q(
          `UPDATE coupons SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
           WHERE restaurant_id = $1 AND UPPER(code) = UPPER($2)`,
          [restaurantId, order.coupon_code],
        );
        await q(`UPDATE orders SET coupon_code = NULL, updated_at = NOW() WHERE id = $1`, [req.params.orderId]);
      }
      return true;
    });
    if (!found) throw new NotFoundError('Order not found');
    res.json(successResponse({ code: null, discount: 0 }, { message: 'Coupon removed' }));
  } catch (err) { next(err); }
});

export default router;
