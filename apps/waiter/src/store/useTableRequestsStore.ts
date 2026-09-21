/**
 * Real-time "Call Waiter" / "Request Bill" alerts.
 *
 * Connects to the same Socket.io server the admin dashboard uses, joins this
 * restaurant's room, and keeps a live list of PENDING requests. On a new
 * request it vibrates the device, plays a short beep, and shows a toast —
 * this only fires while the waiter app is open on screen (same as the
 * Kitchen Display's live updates).
 */

import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import toast from 'react-hot-toast'
import { api } from '../api/client'

export interface TableRequest {
  id: string
  type: 'CALL_WAITER' | 'REQUEST_BILL'
  created_at: string
  table_number: string
}

interface TableRequestsState {
  requests: TableRequest[]
  connected: boolean
  connect: (token: string, restaurantId: string) => void
  disconnect: () => void
  fetchPending: () => Promise<void>
  resolve: (id: string) => Promise<void>
}

let socket: Socket | null = null

const REQUEST_LABEL: Record<TableRequest['type'], string> = {
  CALL_WAITER: 'needs a waiter',
  REQUEST_BILL: 'wants the bill',
}

// Two short beeps via the Web Audio API — no audio file needed. Browsers
// generally require a prior user gesture (e.g. the login tap) before audio
// is allowed to play, which the waiter app already has by the time this fires.
function playAlertSound() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const beep = (delay: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.001, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.3)
    }
    beep(0)
    beep(0.35)
  } catch {
    // Audio not available — vibration + toast still fire.
  }
}

export const useTableRequestsStore = create<TableRequestsState>((set, get) => ({
  requests: [],
  connected: false,

  connect: (token, restaurantId) => {
    if (socket) return

    socket = io(import.meta.env.VITE_SOCKET_URL || '', {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    socket.on('connect', () => {
      set({ connected: true })
      socket?.emit('join_restaurant', { restaurantId })
    })

    socket.on('disconnect', () => set({ connected: false }))

    socket.on('TABLE_REQUEST_CREATED', (payload: any) => {
      set((state) => ({
        requests: [
          ...state.requests,
          {
            id: payload.request_id,
            type: payload.type,
            created_at: new Date().toISOString(),
            table_number: payload.table_number || '',
          },
        ],
      }))

      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300])
      playAlertSound()
      toast(
        `Table ${payload.table_number || ''} ${REQUEST_LABEL[payload.type as TableRequest['type']] || 'needs help'}`,
        { icon: payload.type === 'REQUEST_BILL' ? '🧾' : '🔔', duration: 8000 },
      )
    })

    socket.on('TABLE_REQUEST_RESOLVED', (payload: any) => {
      set((state) => ({
        requests: state.requests.filter((r) => r.id !== payload.request_id),
      }))
    })
  },

  disconnect: () => {
    socket?.close()
    socket = null
    set({ connected: false, requests: [] })
  },

  fetchPending: async () => {
    try {
      const res = await api.get<{ success: boolean; data: TableRequest[] }>('/table-requests')
      set({ requests: res.data.data || [] })
    } catch {
      // Non-fatal — the live socket feed will still populate new ones.
    }
  },

  resolve: async (id) => {
    set((state) => ({ requests: state.requests.filter((r) => r.id !== id) }))
    try {
      await api.post(`/table-requests/${id}/resolve`)
    } catch {
      // If this fails the request will simply reappear on the next fetchPending().
    }
  },
}))
