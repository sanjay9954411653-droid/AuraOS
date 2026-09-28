/**
 * Server-side twin of client/src/lib/billing.ts.
 *
 * orders.total_amount only holds the raw item subtotal. What the customer
 * actually sees on the bill (and pays) also includes discount, service charge,
 * other charges, an extra flat charge and GST. Payment validation must use the
 * same grand total, otherwise the bill says ₹425.88 but the server only lets
 * ₹390 be collected.
 */

export interface BillingSettings {
  tax_rate: number;
  tax_inclusive: boolean;
  discount_percent: number;
  service_charge_percent: number;
  other_charges_percent: number;
  extra_charges_amount: number;
}

import { computeCouponDiscount } from '@/modules/coupons/coupons.rules';

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeBilling(r: Record<string, unknown> | null | undefined): BillingSettings {
  return {
    tax_rate: num(r?.tax_rate, 5), // matches BillScreen's default
    tax_inclusive: Boolean(r?.tax_inclusive),
    discount_percent: num(r?.discount_percent),
    service_charge_percent: num(r?.service_charge_percent),
    other_charges_percent: num(r?.other_charges_percent),
    extra_charges_amount: num(r?.extra_charges_amount),
  };
}

export function calcGrandTotal(rawSubtotal: number, s: BillingSettings, couponDiscount = 0): number {
  const taxRate = s.tax_rate;
  const inclusive = s.tax_inclusive;
  // Coupon first, then the restaurant's discount % on what is left (same as the client).
  const base = Math.max(0, rawSubtotal - Math.max(0, couponDiscount));
  const discount = (base * s.discount_percent) / 100;
  const afterDiscount = base - discount;

  let preTaxTotal = afterDiscount;
  let taxAmount = 0;
  if (inclusive && taxRate > 0) {
    preTaxTotal = afterDiscount / (1 + taxRate / 100);
    taxAmount = afterDiscount - preTaxTotal;
  }

  const serviceCharge = (preTaxTotal * s.service_charge_percent) / 100;
  const otherCharges = (preTaxTotal * s.other_charges_percent) / 100;
  const extra = s.extra_charges_amount;

  if (!inclusive && taxRate > 0) {
    taxAmount = ((preTaxTotal + serviceCharge + otherCharges + extra) * taxRate) / 100;
  }

  const grand = preTaxTotal + serviceCharge + otherCharges + extra + taxAmount;
  return Math.round(grand * 100) / 100;
}

export type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

/** Coupon staff applied to an order + its discount on the current subtotal. */
export async function getOrderCouponDiscount(
  q: QueryFn,
  restaurantId: string,
  orderId: string,
  subtotal: number,
): Promise<{ code: string | null; discount: number }> {
  const o = await q(`SELECT coupon_code FROM orders WHERE id = $1 AND restaurant_id = $2`, [orderId, restaurantId]);
  const code: string | null = o.rows[0]?.coupon_code ?? null;
  if (!code) return { code: null, discount: 0 };

  const c = await q(
    `SELECT * FROM coupons WHERE restaurant_id = $1 AND UPPER(code) = UPPER($2) LIMIT 1`,
    [restaurantId, code],
  );
  if (c.rows.length === 0) return { code, discount: 0 };

  // This order already holds one use of the coupon, so don't let that use
  // count against the usage limit when re-checking it.
  const coupon = { ...c.rows[0], used_count: Math.max(0, Number(c.rows[0].used_count) - 1) };
  const r = computeCouponDiscount(coupon, subtotal);
  return { code, discount: r.valid ? r.discount : 0 };
}

/**
 * Grand total (incl. GST + charges, minus any coupon staff applied) an order
 * should be paid in full for. Pass inTx=true when q runs inside a transaction.
 */
export async function getOrderPayableTotal(
  q: QueryFn,
  restaurantId: string,
  subtotal: number,
  orderId?: string,
  inTx = false,
): Promise<number> {
  if (!(subtotal > 0)) return 0;
  const res = await q(
    `SELECT tax_rate::float8 AS tax_rate, tax_inclusive,
            discount_percent::float8 AS discount_percent,
            service_charge_percent::float8 AS service_charge_percent,
            other_charges_percent::float8 AS other_charges_percent,
            extra_charges_amount::float8 AS extra_charges_amount
     FROM restaurants WHERE id = $1`,
    [restaurantId],
  );

  let couponDiscount = 0;
  if (orderId) {
    try {
      if (inTx) await q('SAVEPOINT coupon_lookup');
      couponDiscount = (await getOrderCouponDiscount(q, restaurantId, orderId, subtotal)).discount;
      if (inTx) await q('RELEASE SAVEPOINT coupon_lookup');
    } catch {
      // Coupon column not there yet / lookup failed: never block a payment.
      if (inTx) await q('ROLLBACK TO SAVEPOINT coupon_lookup');
    }
  }
  return calcGrandTotal(subtotal, normalizeBilling(res.rows[0]), couponDiscount);
}
