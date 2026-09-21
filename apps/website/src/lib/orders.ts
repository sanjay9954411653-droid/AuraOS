'use client';

/**
 * Device-local order memory. Guests (and signed-in customers) get their recent
 * orders remembered in this browser so "Ongoing Order" / "Order History" work
 * without an account. Signed-in customers also get server-side history — see
 * the orders page, which merges both.
 */
export interface SavedOrder {
  order_number: string;
  order_id: string;
  total_amount: number;
  payment_method: string;
  placed_at: string; // ISO
}

const KEY = 'auraos_orders';
const MAX_SAVED = 50;

export function getSavedOrders(): SavedOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOrder(order: SavedOrder): void {
  try {
    const rest = getSavedOrders().filter((o) => o.order_number !== order.order_number);
    window.localStorage.setItem(KEY, JSON.stringify([order, ...rest].slice(0, MAX_SAVED)));
  } catch {
    /* storage unavailable — history is a nicety, never block ordering */
  }
}

/** An order is "ongoing" until it is delivered/completed or cancelled. */
export function isOngoing(status?: string | null): boolean {
  return !!status && status !== 'COMPLETED' && status !== 'CANCELLED';
}
