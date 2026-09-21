/**
 * Slide-out menu + order tracking for the public QR ordering page (CustomerApp).
 *
 *  - Welcome panel
 *  - Discover Restaurant (coming soon)
 *  - Place Order       → closes the drawer, back to the menu
 *  - Ongoing Order     → live status of orders that are not finished yet
 *  - Order History     → every order placed from this device, with "Order again"
 *                        and a star rating for finished orders
 *  - LiveOrderBanner   → a strip on the menu page showing the current order's progress
 *
 * Orders are remembered in the browser (localStorage) per restaurant, and their
 * live status comes from the existing public endpoint
 *   GET /api/v1/public/site/:slug/order/:orderNumber
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { formatCurrency } from '../lib/utils'

const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 15000,
})

// ── Order memory (per restaurant, on this device) ────────────────────────────
export interface SavedOrderLine {
  menu_item_id: string
  name: string
  quantity: number
  modifiers: Array<{
    group_id: string
    group_name: string
    option_id: string
    option_name: string
    price_adjustment: number
  }>
}

export interface SavedCustomerOrder {
  order_number: string
  total_amount: number // as returned when the order was placed (before GST)
  items_count: number
  payment_method: string
  table_number?: string
  placed_at: string // ISO
  items?: SavedOrderLine[] // what was ordered — powers "Order again"
}

const MAX_SAVED_ORDERS = 50
const MAX_TRACKED_ORDERS = 20
// An order not finished after this long is treated as forgotten, not "ongoing".
const ONGOING_WINDOW_MS = 12 * 60 * 60 * 1000
const POLL_MS = 15000
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

// ── Ratings given from this device (order number → stars; 0 = rated elsewhere) ──
const ratingsKey = (slug: string) => `auraos_ratings:${slug}`

function loadRatings(slug: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(ratingsKey(slug))
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveRating(slug: string, orderNumber: string, stars: number): void {
  try {
    localStorage.setItem(ratingsKey(slug), JSON.stringify({ ...loadRatings(slug), [orderNumber]: stars }))
  } catch {
    // Storage unavailable — the customer may just see the Rate button again.
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

const STATUS_HINTS: Record<string, string> = {
  CREATED: 'Waiting for the kitchen to accept',
  ACCEPTED: 'The kitchen has your order',
  PREPARING: 'Your food is being prepared',
  READY: 'Your order is ready!',
  OUT_FOR_DELIVERY: 'On its way to you',
}

const PROGRESS_STEPS = ['CREATED', 'ACCEPTED', 'PREPARING', 'READY']

const isFinal = (status?: string) => status === 'COMPLETED' || status === 'CANCELLED'
const isOngoing = (status?: string) => !!status && !isFinal(status)

export type OrderRow = SavedCustomerOrder & { status?: string }

const isRecent = (o: SavedCustomerOrder) => Date.now() - new Date(o.placed_at).getTime() < ONGOING_WINDOW_MS
const isLiveOrder = (o: OrderRow) => isOngoing(o.status) && isRecent(o)

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

export type OrdersView = 'ongoing' | 'history'

// ── Live status of this device's orders ──────────────────────────────────────
/**
 * Loads the saved orders with their live status and keeps them fresh.
 * Finished orders (and forgotten old ones) are only looked up once, so the
 * page only polls the orders that can still change. Vibrates the phone when
 * an order turns READY.
 */
export function useTrackedOrders(slug: string) {
  const [rows, setRows] = useState<OrderRow[] | null>(null)
  const alive = useRef(true)
  const settled = useRef<Record<string, string | undefined>>({}) // order number → final status (or last known if too old)
  const lastStatus = useRef<Record<string, string | undefined>>({})

  const refresh = useCallback(async () => {
    const saved = loadSavedCustomerOrders(slug).slice(0, MAX_TRACKED_ORDERS)
    const withStatus = await Promise.all(
      saved.map(async (o): Promise<OrderRow> => {
        if (o.order_number in settled.current) return { ...o, status: settled.current[o.order_number] }
        try {
          const res = await publicApi.get(`/public/site/${slug}/order/${encodeURIComponent(o.order_number)}`)
          const status = res.data?.data?.status as string | undefined
          if (isFinal(status) || !isRecent(o)) settled.current[o.order_number] = status
          return { ...o, status }
        } catch {
          return { ...o, status: lastStatus.current[o.order_number] } // offline — keep what we knew
        }
      }),
    )
    if (!alive.current) return

    for (const r of withStatus) {
      const prev = lastStatus.current[r.order_number]
      if (r.status === 'READY' && prev && prev !== 'READY') {
        try { navigator.vibrate?.([200, 100, 200]) } catch { /* not supported */ }
      }
      lastStatus.current[r.order_number] = r.status
    }
    setRows(withStatus)
  }, [slug])

  useEffect(() => {
    alive.current = true
    refresh()
    const poll = setInterval(() => { if (!document.hidden) refresh() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { rows, refresh }
}

// ── Live order banner (menu page) ────────────────────────────────────────────
export function LiveOrderBanner({ orders, onOpen }: { orders: OrderRow[] | null; onOpen: () => void }) {
  const live = (orders || []).filter(isLiveOrder)
  if (live.length === 0) return null

  const o = live[0]
  const status = o.status || 'CREATED'
  const ready = status === 'READY'
  const stepIndex = Math.max(0, PROGRESS_STEPS.indexOf(status === 'OUT_FOR_DELIVERY' ? 'READY' : status))

  return (
    <div className="max-w-2xl mx-auto px-4 mt-3">
      <button
        onClick={onOpen}
        className={`w-full text-left rounded-2xl px-4 py-3 text-white shadow-md ${ready ? 'bg-emerald-600' : 'bg-[var(--accent)]'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-white/80">
              Order <span className="font-mono font-bold text-white">{o.order_number}</span>
              {live.length > 1 ? ` · +${live.length - 1} more` : ''}
            </p>
            <p className="font-semibold leading-tight mt-0.5">
              {ready ? '🎉 ' : ''}{STATUS_LABELS[status] || status}
              <span className="font-normal text-white/85"> — {STATUS_HINTS[status] || 'In progress'}</span>
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold bg-white/20 rounded-full px-3 py-1.5">Track</span>
        </div>
        <div className="flex gap-1 mt-2.5" aria-hidden>
          {PROGRESS_STEPS.map((step, i) => (
            <span key={step} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
      </button>
    </div>
  )
}

// ── Orders panel ─────────────────────────────────────────────────────────────
function OrdersPanel({
  slug,
  orders,
  view,
  onViewChange,
  onClose,
  onReorder,
}: {
  slug: string
  orders: OrderRow[] | null
  view: OrdersView
  onViewChange: (v: OrdersView) => void
  onClose: () => void
  onReorder: (lines: SavedOrderLine[]) => void
}) {
  // Rating state
  const [ratings, setRatings] = useState<Record<string, number>>(() => loadRatings(slug))
  const [rateFor, setRateFor] = useState<string | null>(null) // order number being rated
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [rateError, setRateError] = useState('')

  const startRating = (orderNumber: string) => {
    setRateFor(orderNumber)
    setStars(0)
    setComment('')
    setRateError('')
  }

  const submitRating = async (orderNumber: string) => {
    if (stars < 1) {
      setRateError('Tap a star to rate your order')
      return
    }
    setSending(true)
    setRateError('')
    try {
      await publicApi.post(`/public/site/${slug}/order/${encodeURIComponent(orderNumber)}/review`, {
        rating: stars,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      })
      saveRating(slug, orderNumber, stars)
      setRatings(loadRatings(slug))
      setRateFor(null)
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Already rated (for example from another phone) — just stop asking.
        saveRating(slug, orderNumber, 0)
        setRatings(loadRatings(slug))
        setRateFor(null)
      } else {
        setRateError(err.response?.data?.error?.message || 'Could not send your rating — please try again')
      }
    } finally {
      setSending(false)
    }
  }

  const shown = orders === null ? null : view === 'ongoing' ? orders.filter(isLiveOrder) : orders

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
            {shown.map((o) => {
              const rated = ratings[o.order_number]
              const canRate = o.status === 'COMPLETED'
              const canReorder = !!o.items && o.items.length > 0
              return (
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

                  {(canRate || canReorder) && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 text-sm">
                          {canRate && rated !== undefined ? (
                            <p className="text-gray-500">
                              {rated > 0 && (
                                <span className="text-amber-500 mr-1.5">
                                  {'★'.repeat(rated)}
                                  <span className="text-gray-300">{'★'.repeat(5 - rated)}</span>
                                </span>
                              )}
                              Thanks for your rating!
                            </p>
                          ) : canRate && rateFor !== o.order_number ? (
                            <button
                              onClick={() => startRating(o.order_number)}
                              className="font-semibold text-[color:var(--accent)]"
                            >
                              ★ Rate this order
                            </button>
                          ) : null}
                        </div>
                        {canReorder && (
                          <button
                            onClick={() => onReorder(o.items!)}
                            className="shrink-0 px-4 py-1.5 text-sm font-semibold rounded-full border-2 border-[color:var(--accent)] text-[color:var(--accent)]"
                          >
                            Order again
                          </button>
                        )}
                      </div>

                      {canRate && rated === undefined && rateFor === o.order_number && (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-gray-800">How was your order?</p>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => { setStars(n); setRateError('') }}
                                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                                className={`text-3xl leading-none ${n <= stars ? 'text-amber-400' : 'text-gray-300'}`}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            maxLength={500}
                            rows={2}
                            placeholder="Tell us more (optional)"
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                          />
                          {rateError && <p className="text-xs text-red-600">{rateError}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={() => submitRating(o.order_number)}
                              disabled={sending}
                              className="flex-1 py-2 bg-[var(--accent)] text-white text-sm font-semibold rounded-full disabled:opacity-50"
                            >
                              {sending ? 'Sending…' : 'Submit rating'}
                            </button>
                            <button
                              onClick={() => setRateFor(null)}
                              disabled={sending}
                              className="px-4 py-2 text-sm text-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
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
  orders,
  drawerOpen,
  onCloseDrawer,
  ordersView,
  onOrdersViewChange,
  onReorder,
}: {
  slug: string
  restaurantName: string
  orders: OrderRow[] | null
  drawerOpen: boolean
  onCloseDrawer: () => void
  ordersView: OrdersView | null
  onOrdersViewChange: (v: OrdersView | null) => void
  onReorder: (lines: SavedOrderLine[]) => void
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
  const liveCount = (orders || []).filter(isLiveOrder).length

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
              <span className="flex-1">Ongoing Order</span>
              {liveCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent)] text-white text-[11px] font-bold flex items-center justify-center">
                  {liveCount}
                </span>
              )}
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
          orders={orders}
          view={ordersView}
          onViewChange={onOrdersViewChange}
          onClose={() => onOrdersViewChange(null)}
          onReorder={onReorder}
        />
      )}
    </>
  )
}
