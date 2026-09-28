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

export function calcGrandTotal(rawSubtotal: number, s: BillingSettings): number {
  const taxRate = s.tax_rate;
  const inclusive = s.tax_inclusive;
  const discount = (rawSubtotal * s.discount_percent) / 100;
  const afterDiscount = rawSubtotal - discount;

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

/** Minimal shape of a pg client/pool so this file has no DB import. */
interface Queryable {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
}

/** Grand total (incl. GST + charges) an order should be paid in full for. */
export async function getOrderPayableTotal(
  db: Queryable,
  restaurantId: string,
  subtotal: number,
): Promise<number> {
  if (!(subtotal > 0)) return 0;
  const res = await db.query(
    `SELECT tax_rate::float8 AS tax_rate, tax_inclusive,
            discount_percent::float8 AS discount_percent,
            service_charge_percent::float8 AS service_charge_percent,
            other_charges_percent::float8 AS other_charges_percent,
            extra_charges_amount::float8 AS extra_charges_amount
     FROM restaurants WHERE id = $1`,
    [restaurantId],
  );
  return calcGrandTotal(subtotal, normalizeBilling(res.rows[0]));
}
