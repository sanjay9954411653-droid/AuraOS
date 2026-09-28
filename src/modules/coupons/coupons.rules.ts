/**
 * Pure coupon rules — deliberately has no imports so they are easy to test.
 */

export interface CouponRuleInput {
  discount_type: string;
  discount_value: number | string;
  valid_from?: string | Date | null;
  valid_until?: string | Date | null;
}

/** Returns a plain-English problem with the coupon, or null when it is fine. */
export function couponRuleError(c: CouponRuleInput): string | null {
  if (c.discount_type === 'PERCENT' && Number(c.discount_value) > 100) {
    return 'A percent discount cannot be more than 100%';
  }
  if (
    c.valid_from &&
    c.valid_until &&
    new Date(c.valid_until).getTime() <= new Date(c.valid_from).getTime()
  ) {
    return '"Valid until" must be after "Valid from"';
  }
  return null;
}

// Whitelist of columns an edit may change (never built from user-supplied keys).
export const COUPON_UPDATABLE_COLUMNS = [
  'code',
  'description',
  'discount_type',
  'discount_value',
  'min_order',
  'max_discount',
  'usage_limit',
  'valid_from',
  'valid_until',
  'is_active',
] as const;

/**
 * Builds the UPDATE for an edit. Only fields that were actually sent are
 * changed, and `null` is a real value that CLEARS an optional field
 * (e.g. removes a usage limit) — unlike the old COALESCE approach, which
 * could never clear anything.
 */
export function buildCouponUpdate(
  id: string,
  changes: Record<string, unknown>,
): { sql: string; values: unknown[] } | null {
  const sets: string[] = [];
  const values: unknown[] = [id];

  for (const col of COUPON_UPDATABLE_COLUMNS) {
    const v = changes[col];
    if (v === undefined) continue; // not sent → leave as it is
    values.push(col === 'code' ? String(v).toUpperCase() : v);
    sets.push(`${col} = $${values.length}`);
  }

  if (sets.length === 0) return null;
  return {
    sql: `UPDATE coupons SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values,
  };
}

/**
 * Pure discount calculation, shared by the public validate endpoint and order
 * placement. Returns the rupee discount (>= 0) or a reason it doesn't apply.
 */
export function computeCouponDiscount(
  coupon: {
    discount_type: 'FLAT' | 'PERCENT';
    discount_value: number;
    min_order: number;
    max_discount: number | null;
    usage_limit: number | null;
    used_count: number;
    valid_from: string | null;
    valid_until: string | null;
    is_active: boolean;
  },
  orderTotal: number,
  now: Date = new Date(),
): { valid: boolean; discount: number; message?: string } {
  if (!coupon.is_active) return { valid: false, discount: 0, message: 'Coupon is not active' };
  if (coupon.valid_from && now < new Date(coupon.valid_from)) return { valid: false, discount: 0, message: 'Coupon not yet valid' };
  if (coupon.valid_until && now > new Date(coupon.valid_until)) return { valid: false, discount: 0, message: 'Coupon has expired' };
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) return { valid: false, discount: 0, message: 'Coupon usage limit reached' };
  if (orderTotal < Number(coupon.min_order)) {
    return { valid: false, discount: 0, message: `Minimum order ₹${Number(coupon.min_order).toFixed(0)}` };
  }

  let discount =
    coupon.discount_type === 'PERCENT'
      ? (orderTotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);

  if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
  discount = Math.min(discount, orderTotal); // never exceed the bill
  discount = Math.round(discount * 100) / 100;

  return { valid: true, discount };
}
