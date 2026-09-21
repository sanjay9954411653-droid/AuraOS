'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTenantSlug } from '@/components/Providers';
import { getCustomerToken, getMyOrders, trackOrder } from '@/lib/client';
import { getSavedOrders, isOngoing } from '@/lib/orders';

interface OrderRow {
  order_number: string;
  total_amount: number;
  placed_at: string;
  status?: string;
}

const LABELS: Record<string, string> = {
  CREATED: 'Order Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  COMPLETED: 'Delivered',
  CANCELLED: 'Cancelled',
};

function chipStyle(status?: string) {
  if (status === 'CANCELLED') return 'bg-red-50 text-red-700';
  if (status === 'COMPLETED') return 'bg-green-50 text-green-700';
  return 'bg-blue-50 text-blue-700';
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Loads orders for this restaurant: server-side history for signed-in
 * customers (works across devices) merged with orders remembered on this
 * device (works for guests). Refreshes every 20s so ongoing orders stay live.
 */
function useOrders(slug: string) {
  const [rows, setRows] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const byNumber = new Map<string, OrderRow>();

      if (getCustomerToken()) {
        try {
          const mine = await getMyOrders(slug);
          for (const o of mine) {
            byNumber.set(o.order_number, {
              order_number: o.order_number,
              total_amount: Number(o.total_amount),
              placed_at: o.created_at,
              status: o.status,
            });
          }
        } catch {
          /* fall back to device history below */
        }
      }

      // Device-local orders not already covered by the server list.
      const local = getSavedOrders().filter((o) => !byNumber.has(o.order_number)).slice(0, 20);
      const fetched = await Promise.all(
        local.map(async (o): Promise<OrderRow> => {
          try {
            const st = await trackOrder(slug, o.order_number);
            return { order_number: o.order_number, total_amount: Number(st.total_amount), placed_at: o.placed_at, status: st.status };
          } catch {
            return { order_number: o.order_number, total_amount: Number(o.total_amount), placed_at: o.placed_at };
          }
        }),
      );
      for (const r of fetched) byNumber.set(r.order_number, r);

      const all = [...byNumber.values()].sort((a, b) => +new Date(b.placed_at) - +new Date(a.placed_at));
      if (active) setRows(all);
    }

    load();
    const poll = setInterval(load, 20000);
    return () => { active = false; clearInterval(poll); };
  }, [slug]);

  return rows;
}

function OrdersView() {
  const slug = useTenantSlug();
  const params = useSearchParams();
  const tab = params.get('tab') === 'ongoing' ? 'ongoing' : 'history';
  const rows = useOrders(slug);

  const shown = rows === null ? null : tab === 'ongoing' ? rows.filter((r) => isOngoing(r.status)) : rows;

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold ${active ? 'text-white' : 'border'}`;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-8">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-primary)' }}>
        {tab === 'ongoing' ? 'Ongoing Orders' : 'Order History'}
      </h1>
      <p className="mb-5 mt-1 text-sm opacity-60">
        {getCustomerToken() ? 'Your orders' : 'On this device'}
      </p>

      <div className="mb-5 flex gap-2">
        <a href="/orders?tab=ongoing" className={tabClass(tab === 'ongoing')}
          style={tab === 'ongoing' ? { backgroundColor: 'var(--brand-primary)' } : undefined}>Ongoing</a>
        <a href="/orders?tab=history" className={tabClass(tab === 'history')}
          style={tab === 'history' ? { backgroundColor: 'var(--brand-primary)' } : undefined}>History</a>
      </div>

      {shown === null ? (
        <p className="opacity-60">Loading orders…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border p-6 text-center">
          <p className="opacity-70">
            {tab === 'ongoing' ? 'No ongoing orders right now.' : 'No orders yet.'}
          </p>
          <a href="/menu" className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}>Place Order</a>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => (
            <li key={o.order_number}>
              <a href={`/track/${encodeURIComponent(o.order_number)}`} className="block rounded-xl border p-4 shadow-sm hover:shadow">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs opacity-60">{formatDate(o.placed_at)}</p>
                    <p className="mt-0.5 font-semibold">{o.order_number}</p>
                  </div>
                  {o.status ? (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${chipStyle(o.status)}`}>
                      {LABELS[o.status] || o.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 font-semibold" style={{ color: 'var(--brand-accent)' }}>
                  ₹{Number(o.total_amount).toFixed(0)}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md flex-1 px-6 py-8 opacity-60">Loading…</main>}>
      <OrdersView />
    </Suspense>
  );
}
