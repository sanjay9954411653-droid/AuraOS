import { query } from '@/config/database';
import { webpush, pushEnabled } from '@/config/webpush';

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

class PushService {
  async saveSubscription(
    userId: string,
    restaurantId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ): Promise<void> {
    await query(
      `INSERT INTO push_subscriptions (user_id, restaurant_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id, restaurant_id = EXCLUDED.restaurant_id,
             p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [userId, restaurantId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
    );
  }

  async removeSubscription(endpoint: string): Promise<void> {
    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
  }

  /**
   * Push a notification to every staff device subscribed for this
   * restaurant (e.g. all waiters who've enabled notifications). Silently
   * does nothing if VAPID keys aren't configured. Expired/invalid
   * subscriptions (410/404 from the push service, e.g. the app was
   * uninstalled) are cleaned up automatically.
   */
  async sendToRestaurant(restaurantId: string, payload: PushPayload): Promise<void> {
    if (!pushEnabled) return;

    const result = await query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE restaurant_id = $1`,
      [restaurantId],
    );
    if (result.rows.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      result.rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            body,
          );
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            // Subscription is dead (browser data cleared, app uninstalled, etc.)
            await query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id]).catch(() => {});
          } else {
            // eslint-disable-next-line no-console
            console.error('Push send failed:', err?.message || err);
          }
        }
      }),
    );
  }
}

export const pushService = new PushService();
