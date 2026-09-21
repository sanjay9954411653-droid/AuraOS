import crypto from 'crypto';
import { withTenant } from '@/config/database';

/**
 * Short, easy-to-read order numbers, e.g. "K7M2PX".
 *
 * - 6 characters from an alphabet without look-alikes (no I, L, O, 0, 1), so a
 *   customer can read it out and staff can type it without mistakes.
 * - Unique per restaurant (the orders table enforces UNIQUE(restaurant_id, order_number)).
 * - Old long order numbers keep working — nothing parses the format.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 characters
const ORDER_CODE_LENGTH = 6;
const MAX_ATTEMPTS = 8;

function randomCode(length: number): string {
  let out = '';
  while (out.length < length) {
    const byte = crypto.randomBytes(1)[0];
    // 248 = 31 * 8 — discarding higher values keeps every character equally likely.
    if (byte < 248) out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

/** Generate an order number that is not already used by this restaurant. */
export async function generateOrderNumber(restaurantId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode(ORDER_CODE_LENGTH);
    try {
      const taken = await withTenant(restaurantId, async (q) => {
        const r = await q(
          'SELECT 1 FROM orders WHERE restaurant_id = $1 AND order_number = $2 LIMIT 1',
          [restaurantId, code],
        );
        return r.rows.length > 0;
      });
      if (!taken) return code;
    } catch {
      // Best effort — the UNIQUE(restaurant_id, order_number) constraint is the final guard.
      return code;
    }
  }
  // Practically unreachable; a longer code makes a clash essentially impossible.
  return randomCode(ORDER_CODE_LENGTH + 2);
}
