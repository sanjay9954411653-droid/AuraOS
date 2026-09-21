/**
 * Slide-out menu for the public QR ordering page (CustomerApp).
 *
 *  - Welcome panel
 *  - Discover Restaurant (coming soon)
 *  - Place Order       → closes the drawer, back to the menu
 *  - Ongoing Order     → live status of orders that are not finished yet
 *  - Order History     → every order placed from this device
 *
 * Orders are remembered in the browser (localStorage) per restaurant, and their
 * live status comes from the existing public endpoint
 *   GET /api/v1/public/site/:slug/order/:orderNumber
 * so no backend change is needed.
 */

import { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { formatCurrency } from '../lib/utils'

const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 15000,
})

// ── Order memory (per restaurant, on this device) ────────────────────────────
export interface SavedCustomerOrder {
  order_number: string
  total_amount: number // as returned when the order was placed (before GST)
  items_count: number
  payment_method: string
  table_number?: string
  placed_at: string // ISO
}

const MAX_SAVED_ORDERS = 50
const MAX_TRACKED_ORDERS = 20
const ordersKey = (slug: string) => `auraos_orders:${slug}`

// The order confirmation screen shows total × 1.18 (GST); history matches it.
const withGst = (amount: number) => Number(amount) * 1.18

export function loadSavedCustomerOrders(slug: string): SavedCustomerOrder[] {
  try {
    const raw = localStorage.getItem(ordersKey(slug))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomerOrder(slug: string, order: SavedCustomerOrder): void {
  try {
    const rest = loadSavedCustomerOrders(slug).filter((o) => o.order_number !== order.order_number)
    localStorage.setItem(ordersKey(slug), JSON.stringify([order, ...rest].slice(0, MAX_SAVED_ORDERS)))
  } catch {
    // Storage unavailable (private mode) — history just won't be kept.
  }
}

// ── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  CREATED: 'Order Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const isOngoing = (status?: string) => !!status && status !== 'COMPLETED' && status !== 'CANCELLED'

const statusChipClass = (status?: string) => {
  if (status === 'CANCELLED') return 'bg-red-50 text-red-700'
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-700'
  if (status === 'READY') return 'bg-amber-50 text-amber-700'
  return 'bg-blue-50 text-blue-700'
}

const formatWhen = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type OrderRow = SavedCustomerOrder & { status?: string }
export type OrdersView = 'ongoing' | 'history'

// ── Orders panel ─────────────────────────────────────────────────────────────
function OrdersPanel({
  slug,
  view,
  onViewChange,
  onClose,
}: {
  slug: string
  view: OrdersView
  onViewChange: (v: OrdersView) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<OrderRow[] | null>(null)

  // Load saved orders, look up each one's live status, and refresh every 15s.
  useEffect(() => {
    let active = true

    const load = async () => {
      const saved = loadSavedCustomerOrders(slug).slice(0, MAX_TRACKED_ORDERS)
      const withStatus = await Promise.all(
        saved.map(async (o): Promise<OrderRow> => {
          try {
            const res = await publicApi.get(`/public/site/${slug}/order/${encodeURIComponent(o.order_number)}`)
            return { ...o, status: res.data?.data?.status as string | undefined }
          } catch {
            return o // offline / not found — still list it in History
          }
        }),
      )
      if (active) setRows(withStatus)
    }

    load()
    const poll = setInterval(load, 15000)
    return () => {
      active = false
      clearInterval(poll)
    }
  }, [slug])

  const shown = rows === null ? null : view === 'ongoing' ? rows.filter((r) => isOngoing(r.status)) : rows

  const tabClass = (active: boolean) =>
    `flex-1 py-2 text-sm font-semibold rounded-full transition-colors ${
      active ? 'bg-[var(--accent)] text-white' : 'bg-white text-gray-600 border border-gray-200'
    }`

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
      <div className="bg-[var(--accent)] text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onClose} aria-label="Back to menu" className="p-1 -ml-1">
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-lg font-bold leading-tight">{view === 'ongoing' ? 'Ongoing Orders' : 'Order History'}</h2>
            <p className="text-xs text-white/80">On this device</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex gap-2 mb-4">
          <button onClick={() => onViewChange('ongoing')} className={tabClass(view === 'ongoing')}>Ongoing</button>
          <button onClick={() => onViewChange('history')} className={tabClass(view === 'history')}>History</button>
        </div>

        {shown === null ? (
          <p className="text-center text-sm text-gray-400 py-10">Loading orders…</p>
        ) : shown.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-sm text-gray-500">
              {view === 'ongoing' ? 'No ongoing orders right now.' : 'No orders yet.'}
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-5 py-2 bg-[var(--accent)] text-white text-sm font-semibold rounded-full"
            >
              Place Order
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((o) => (
              <li key={o.order_number} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">{formatWhen(o.placed_at)}</p>
                    <p className="font-bold text-gray-900 font-mono mt-0.5">{o.order_number}</p>
                  </div>
                  {o.status && (
                    <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${statusChipClass(o.status)}`}>
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-gray-500">
                    {o.table_number ? `Table ${o.table_number} · ` : ''}
                    {o.items_count} {o.items_count === 1 ? 'item' : 'items'}
                  </span>
                  <span className="font-bold text-[color:var(--accent)]">{formatCurrency(withGst(o.total_amount))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Drawer ───────────────────────────────────────────────────────────────────
export function CustomerMenuDrawer({
  slug,
  restaurantName,
  drawerOpen,
  onCloseDrawer,
  ordersView,
  onOrdersViewChange,
}: {
  slug: string
  restaurantName: string
  drawerOpen: boolean
  onCloseDrawer: () => void
  ordersView: OrdersView | null
  onOrdersViewChange: (v: OrdersView | null) => void
}) {
  // Close on Escape and lock page scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseDrawer()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [drawerOpen, onCloseDrawer])

  const rowClass = 'w-full flex items-center gap-4 px-5 py-3.5 text-[15px] text-gray-800 hover:bg-gray-50 text-left'

  const openOrders = (v: OrdersView) => {
    onCloseDrawer()
    onOrdersViewChange(v)
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div
          onClick={onCloseDrawer}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl flex flex-col transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="bg-[var(--accent)] text-white px-5 py-6">
            <p className="text-lg font-semibold">Welcome</p>
            <p className="text-sm text-white/85 mt-1">Your orders are saved on this device</p>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            <div className={`${rowClass} opacity-60 cursor-not-allowed hover:bg-transparent`} aria-disabled="true">
              <span className="text-xl" aria-hidden>🧭</span>
              <span className="flex-1">Discover Restaurant</span>
              <span className="text-[11px] font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Coming</span>
            </div>
            <button onClick={onCloseDrawer} className={rowClass}>
              <span className="text-xl" aria-hidden>🍽️</span>
              <span>Place Order</span>
            </button>
            <button onClick={() => openOrders('ongoing')} className={rowClass}>
              <span className="text-xl" aria-hidden>⏱️</span>
              <span>Ongoing Order</span>
            </button>
            <button onClick={() => openOrders('history')} className={rowClass}>
              <span className="text-xl" aria-hidden>📜</span>
              <span>Order History</span>
            </button>
          </nav>

          <div className="border-t px-5 py-3 text-xs text-gray-400">{restaurantName}</div>
        </aside>
      </div>

      {ordersView && (
        <OrdersPanel
          slug={slug}
          view={ordersView}
          onViewChange={onOrdersViewChange}
          onClose={() => onOrdersViewChange(null)}
        />
      )}
    </>
  )
}
