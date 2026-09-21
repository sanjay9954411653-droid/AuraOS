/**
 * Public website routes — no authentication.
 *
 * Serves the data the Next.js website needs to render a tenant's site:
 *   GET /api/v1/public/site/:slug/config   — branding, theme, hours, features
 *   GET /api/v1/public/site/:slug/gallery  — active gallery images
 *   GET /api/v1/public/site/:slug/page/:key — a single editable page's content
 *
 * Read-only and tenant-scoped by the :slug param. PostgreSQL is the source of
 * truth; the host->tenant cache only accelerates routing, not these reads.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTenant } from '@/config/database';
import { successResponse } from '@/shared/utils/responseHandler';
import { NotFoundError, BadRequestError, ConflictError } from '@/shared/errors/AppError';
import { publicOrderRateLimiter } from '@/shared/middleware/rateLimiter';

const router = Router();

async function getRestaurantBySlug(slug: string) {
  const result = await query(
    `SELECT id, name, slug, logo_url, hero_image_url, tagline, description,
            address, phone, whatsapp, public_email, social_links,
            latitude, longitude, map_embed_url, features, website_published
     FROM restaurants WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return result.rows[0] || null;
}

// ─── GET /public/site/:slug/config ──────────────────────────────────────────
router.get('/site/:slug/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const [themeRes, hoursRes] = await Promise.all([
      query(`SELECT primary_color, secondary_color, accent_color, background_color,
                    text_color, font_family
             FROM restaurant_themes WHERE restaurant_id = $1 LIMIT 1`, [restaurant.id]),
      query(`SELECT day_of_week, open_time, close_time, is_closed
             FROM opening_hours WHERE restaurant_id = $1 ORDER BY day_of_week ASC`, [restaurant.id]),
    ]);

    const theme = themeRes.rows[0] || {
      primary_color: '#111827',
      secondary_color: '#f59e0b',
      accent_color: '#10b981',
      background_color: '#ffffff',
      text_color: '#111827',
      font_family: 'Inter',
    };

    res.json(successResponse({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        logo_url: restaurant.logo_url,
        hero_image_url: restaurant.hero_image_url,
        tagline: restaurant.tagline,
        description: restaurant.description,
        address: restaurant.address,
        phone: restaurant.phone,
        whatsapp: restaurant.whatsapp,
        email: restaurant.public_email,
        social_links: restaurant.social_links || {},
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        map_embed_url: restaurant.map_embed_url,
        published: restaurant.website_published,
      },
      theme,
      opening_hours: hoursRes.rows,
      features: restaurant.features || {},
    }));
  } catch (err) {
    next(err);
  }
});

// ─── GET /public/site/:slug/gallery ─────────────────────────────────────────
router.get('/site/:slug/gallery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const result = await query(
      `SELECT id, url, caption, category, sort_order
       FROM gallery_images
       WHERE restaurant_id = $1 AND is_active = TRUE
       ORDER BY sort_order ASC, created_at ASC`,
      [restaurant.id],
    );
    res.json(successResponse(result.rows));
  } catch (err) {
    next(err);
  }
});

// ─── GET /public/site/:slug/page/:key ───────────────────────────────────────
router.get('/site/:slug/page/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const result = await query(
      `SELECT page_key, content, is_published
       FROM website_pages
       WHERE restaurant_id = $1 AND page_key = $2 AND is_published = TRUE
       LIMIT 1`,
      [restaurant.id, req.params.key],
    );

    if (result.rows.length === 0) {
      res.json(successResponse({ page_key: req.params.key, content: {}, is_published: false }));
      return;
    }
    res.json(successResponse(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── GET /public/site/:slug/order/:orderNumber ──────────────────────────────
// Public order tracking by order number — powers the live status page. Returns
// only non-sensitive status fields. Real-time updates ride Socket.io; this is the
// initial fetch + a polling fallback.
router.get('/site/:slug/order/:orderNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const result = await query(
      `SELECT id, restaurant_id, order_number, status, total_amount, token_number, created_at, updated_at
       FROM orders
       WHERE restaurant_id = $1 AND order_number = $2
       LIMIT 1`,
      [restaurant.id, req.params.orderNumber],
    );
    if (result.rows.length === 0) throw new NotFoundError('Order not found');
    res.json(successResponse(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /public/site/:slug/order/:orderNumber/review ──────────────────────
// A customer rates a finished order (1–5 stars + optional comment). No login:
// knowing the order number is the proof. Only COMPLETED orders can be rated,
// and each order can be rated once. The owner can hide it from Reviews.
const OrderReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

router.post('/site/:slug/order/:orderNumber/review', publicOrderRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) throw new NotFoundError('Restaurant not found');
    const body = OrderReviewSchema.parse(req.body);

    const created = await withTenant(restaurant.id, async (q) => {
      const orderRes = await q(
        `SELECT id, status FROM orders WHERE restaurant_id = $1 AND order_number = $2 LIMIT 1`,
        [restaurant.id, req.params.orderNumber],
      );
      if (orderRes.rows.length === 0) throw new NotFoundError('Order not found');
      const order = orderRes.rows[0];
      if (order.status !== 'COMPLETED') {
        throw new BadRequestError('You can rate an order once it is completed');
      }

      const inserted = await q(
        `INSERT INTO reviews (restaurant_id, order_id, rating, body)
         SELECT $1::uuid, $2::uuid, $3::smallint, $4::text
         WHERE NOT EXISTS (
           SELECT 1 FROM reviews WHERE restaurant_id = $1::uuid AND order_id = $2::uuid
         )
         RETURNING id, rating, created_at`,
        [restaurant.id, order.id, body.rating, body.comment || null],
      );
      if (inserted.rows.length === 0) throw new ConflictError('This order has already been rated');
      return inserted.rows[0];
    });

    res.status(201).json(successResponse(created, { message: 'Thanks for your rating' }));
  } catch (err) {
    next(err);
  }
});

// ─── GET /public/site/:slug/rating ──────────────────────────────────────────
// Just the average + count of published reviews (small, cacheable) — used for
// the "★ 4.6 (120)" badge on the ordering page.
router.get('/site/:slug/rating', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const summary = await withTenant(restaurant.id, async (q) => {
      const r = await q(
        `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric(3,2) AS average
         FROM reviews WHERE restaurant_id = $1 AND is_published = TRUE`,
        [restaurant.id],
      );
      return r.rows[0];
    });

    res.set('Cache-Control', 'public, max-age=60');
    res.json(successResponse({ count: summary.count, average: Number(summary.average) }));
  } catch (err) {
    next(err);
  }
});

// ─── GET /public/site/:slug/reviews ─────────────────────────────────────────
// Published reviews + aggregate rating for the website's reviews section.
router.get('/site/:slug/reviews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const [list, summary] = await Promise.all([
      query(
        `SELECT r.id, r.rating, r.title, r.body, r.photo_urls, r.created_at, c.name AS customer_name
         FROM reviews r LEFT JOIN customers c ON c.id = r.customer_id
         WHERE r.restaurant_id = $1 AND r.is_published = TRUE
         ORDER BY r.created_at DESC LIMIT 50`,
        [restaurant.id],
      ),
      query(
        `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric(3,2) AS average
         FROM reviews WHERE restaurant_id = $1 AND is_published = TRUE`,
        [restaurant.id],
      ),
    ]);

    res.json(successResponse({
      reviews: list.rows,
      count: summary.rows[0].count,
      average: Number(summary.rows[0].average),
    }));
  } catch (err) {
    next(err);
  }
});

export default router;
