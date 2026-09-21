/**
 * TableRequestsBanner — sticky strip of pending "Call Waiter" / "Request Bill"
 * taps, shown above the page content on every screen. Tap "Done" to resolve.
 */

import { BellAlertIcon, ReceiptPercentIcon, CheckIcon } from '@heroicons/react/24/solid'
import { useTableRequestsStore } from '../store/useTableRequestsStore'

const TableRequestsBanner: React.FC = () => {
  const { requests, resolve } = useTableRequestsStore()

  if (requests.length === 0) return null

  return (
    <div className="sticky top-0 z-30 bg-amber-50 border-b border-amber-200 px-3 py-2 space-y-1.5">
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 bg-white rounded-xl border border-amber-200 px-3 py-2 shadow-sm"
        >
          {r.type === 'CALL_WAITER' ? (
            <BellAlertIcon className="w-5 h-5 text-amber-500 shrink-0" />
          ) : (
            <ReceiptPercentIcon className="w-5 h-5 text-amber-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              Table {r.table_number || '—'}
            </p>
            <p className="text-xs text-gray-500">
              {r.type === 'CALL_WAITER' ? 'Needs a waiter' : 'Wants the bill'}
            </p>
          </div>
          <button
            onClick={() => resolve(r.id)}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            Done
          </button>
        </div>
      ))}
    </div>
  )
}

export default TableRequestsBanner
