/**
 * ConnectionBanner — small strip that only appears when live "Call Waiter" /
 * "Request Bill" alerts have been unreachable for a few seconds, so a waiter
 * isn't silently missing calls without knowing why. Tapping it retries.
 */
import { useTableRequestsStore } from '../store/useTableRequestsStore'

const ConnectionBanner: React.FC = () => {
  const { reconnecting } = useTableRequestsStore()

  if (!reconnecting) return null

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed top-0 inset-x-0 z-50 text-center text-xs font-semibold py-1.5 bg-red-600 text-white"
    >
      Live alerts paused — tap to reconnect
    </button>
  )
}

export default ConnectionBanner
